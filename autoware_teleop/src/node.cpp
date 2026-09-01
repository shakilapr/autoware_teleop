// Copyright 2026 E-Trike Dev. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#include "autoware_teleop/node.hpp"

#include <algorithm>
#include <chrono>
#include <cstdint>

namespace autoware_teleop
{

using autoware_control_msgs::msg::Control;
using autoware_vehicle_msgs::msg::GearCommand;
using autoware_vehicle_msgs::msg::GearReport;
using autoware_vehicle_msgs::msg::SteeringReport;
using autoware_vehicle_msgs::msg::VelocityReport;
using tier4_vehicle_msgs::msg::VehicleEmergencyStamped;

TeleopNode::TeleopNode(const rclcpp::NodeOptions & options)
: rclcpp_lifecycle::LifecycleNode("autoware_teleop", options)
{
  declare_parameter("control_rate", 10.0);
  declare_parameter("arrival_timeout_ms", 500.0);
  declare_parameter("max_speed_forward", 3.0);
  declare_parameter("max_speed_reverse", 0.5);
  declare_parameter("max_steering_angle", 0.747);
  declare_parameter("max_brake_accel", 5.0);
  declare_parameter("gear_initial", "NEUTRAL");

  const auto command_qos = rclcpp::QoS(1).reliable();
  pub_control_ = create_publisher<Control>(
    "/control/command/control_cmd", command_qos);
  pub_gear_ = create_publisher<GearCommand>(
    "/control/command/gear_cmd", command_qos);
  pub_emergency_ = create_publisher<VehicleEmergencyStamped>(
    "/control/command/emergency_cmd", command_qos);

  sub_velocity_ = create_subscription<VelocityReport>(
    "/vehicle/status/velocity_status", rclcpp::QoS(1),
    [this](const VelocityReport::SharedPtr m) {on_velocity(m);});
  sub_steering_ = create_subscription<SteeringReport>(
    "/vehicle/status/steering_status", rclcpp::QoS(1),
    [this](const SteeringReport::SharedPtr m) {on_steering(m);});
  sub_gear_ = create_subscription<GearReport>(
    "/vehicle/status/gear_status", rclcpp::QoS(1),
    [this](const GearReport::SharedPtr m) {on_gear(m);});

  // Intent arrives from keyboard or the web proxy. The node is the single
  // authority publishing /control/command/*; the deadman applies to all sources.
  sub_intent_ = create_subscription<autoware_teleop_msgs::msg::Intent>(
    "~/intent", rclcpp::QoS(10),
    [this](const autoware_teleop_msgs::msg::Intent::SharedPtr m) {on_intent(m);});

  RCLCPP_INFO(get_logger(), "TeleopNode constructed.");
}

TeleopNode::~TeleopNode()
{
  telemetry_running_ = false;
  if (telemetry_thread_.joinable()) {telemetry_thread_.join();}
}

void TeleopNode::load_parameters()
{
  params_.control_rate = get_parameter("control_rate").as_double();
  params_.arrival_timeout_ms = get_parameter("arrival_timeout_ms").as_double();
  params_.max_speed_forward = get_parameter("max_speed_forward").as_double();
  params_.max_speed_reverse = get_parameter("max_speed_reverse").as_double();
  params_.max_steering_angle = get_parameter("max_steering_angle").as_double();
  params_.max_brake_accel = get_parameter("max_brake_accel").as_double();
}

// ---- lifecycle ----
rclcpp_lifecycle::node_interfaces::LifecycleNodeInterface::CallbackReturn TeleopNode::
on_configure(const rclcpp_lifecycle::State &)
{
  load_parameters();
  if (params_.control_rate <= 0.0) {
    RCLCPP_ERROR(get_logger(), "control_rate must be positive");
    return CallbackReturn::FAILURE;
  }

  const auto period = std::chrono::duration_cast<std::chrono::nanoseconds>(
    std::chrono::duration<double>(1.0 / params_.control_rate));
  timer_ = create_wall_timer(period, std::bind(&TeleopNode::on_timer, this));
  timer_->cancel();
  RCLCPP_INFO(
    get_logger(), "Configured: rate=%.1fHz timeout=%.0fms",
    params_.control_rate, params_.arrival_timeout_ms);
  return CallbackReturn::SUCCESS;
}

rclcpp_lifecycle::node_interfaces::LifecycleNodeInterface::CallbackReturn TeleopNode::
on_activate(const rclcpp_lifecycle::State &)
{
  pub_control_->on_activate();
  pub_gear_->on_activate();
  pub_emergency_->on_activate();

  emergency_.store(false, std::memory_order_relaxed);
  last_intent_ms_.store(0, std::memory_order_relaxed);

  telemetry_running_ = true;
  telemetry_thread_ = std::thread(&TeleopNode::run_telemetry, this);
  timer_->reset();
  RCLCPP_INFO(get_logger(), "Activated.");
  return CallbackReturn::SUCCESS;
}

rclcpp_lifecycle::node_interfaces::LifecycleNodeInterface::CallbackReturn TeleopNode::
on_deactivate(const rclcpp_lifecycle::State &)
{
  timer_->cancel();
  telemetry_running_ = false;
  if (telemetry_thread_.joinable()) {telemetry_thread_.join();}

  // Release to a safe state: zero velocity + neutral.
  pub_control_->on_deactivate();
  pub_gear_->on_deactivate();
  pub_emergency_->on_deactivate();
  RCLCPP_INFO(get_logger(), "Deactivated (safe release).");
  return CallbackReturn::SUCCESS;
}

rclcpp_lifecycle::node_interfaces::LifecycleNodeInterface::CallbackReturn TeleopNode::
on_cleanup(const rclcpp_lifecycle::State &)
{
  timer_.reset();
  return CallbackReturn::SUCCESS;
}

rclcpp_lifecycle::node_interfaces::LifecycleNodeInterface::CallbackReturn TeleopNode::
on_shutdown(const rclcpp_lifecycle::State &)
{
  telemetry_running_ = false;
  if (telemetry_thread_.joinable()) {telemetry_thread_.join();}
  timer_.reset();
  return CallbackReturn::SUCCESS;
}

// ---- intent / emergency ----
void TeleopNode::set_intent(const Intent & intent)
{
  {
    std::lock_guard<std::mutex> lock(mutex_);
    intent_ = intent;
  }
  last_intent_ms_.store(
    std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count(),
    std::memory_order_relaxed);
}

void TeleopNode::set_emergency(bool on)
{
  emergency_.store(on, std::memory_order_relaxed);
}

// ---- reports ----
void TeleopNode::on_velocity(const VelocityReport::SharedPtr msg)
{
  std::lock_guard<std::mutex> lock(mutex_);
  vehicle_.velocity = msg->longitudinal_velocity;
}

void TeleopNode::on_steering(const SteeringReport::SharedPtr msg)
{
  std::lock_guard<std::mutex> lock(mutex_);
  vehicle_.steer_angle = msg->steering_tire_angle;
}

void TeleopNode::on_gear(const GearReport::SharedPtr msg)
{
  std::lock_guard<std::mutex> lock(mutex_);
  vehicle_.gear = msg->report;
}

void TeleopNode::on_intent(const autoware_teleop_msgs::msg::Intent::SharedPtr msg)
{
  Intent intent;
  intent.throttle = msg->throttle;
  intent.brake = msg->brake;
  intent.steer = msg->steer;
  intent.gear = msg->gear;
  intent.estop = (msg->estop % 2) == 1;   // odd = armed
  intent.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::steady_clock::now().time_since_epoch()).count();

  {
    std::lock_guard<std::mutex> lock(mutex_);
    intent_ = intent;
  }
  last_intent_ms_.store(intent.timestamp_ms, std::memory_order_relaxed);
  emergency_.store(intent.estop, std::memory_order_relaxed);
}

// ---- control ----
bool TeleopNode::intent_fresh() const
{
  const int64_t now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::steady_clock::now().time_since_epoch()).count();
  const int64_t last = last_intent_ms_.load(std::memory_order_relaxed);
  if (last == 0) {return false;}
  return (now_ms - last) < params_.arrival_timeout_ms;
}

Control TeleopNode::make_control()
{
  Control msg;
  std::lock_guard<std::mutex> lock(mutex_);
  msg.lateral.steering_tire_angle =
    static_cast<float>(intent_.steer * params_.max_steering_angle);
  double vel = intent_.throttle >= 0.0
    ? intent_.throttle * params_.max_speed_forward
    : intent_.throttle * params_.max_speed_reverse;
  msg.longitudinal.velocity = static_cast<float>(vel);
  if (intent_.brake > 0.0) {
    msg.longitudinal.acceleration = static_cast<float>(-intent_.brake * params_.max_brake_accel);
    msg.longitudinal.is_defined_acceleration = true;
  } else {
    msg.longitudinal.acceleration = 0.0f;
    msg.longitudinal.is_defined_acceleration = false;
  }
  return msg;
}

void TeleopNode::on_timer()
{
  if (emergency_.load(std::memory_order_relaxed)) {
    auto emg = std::make_unique<VehicleEmergencyStamped>();
    emg->emergency = true;
    pub_emergency_->publish(std::move(emg));

    Control zero = make_control();
    zero.longitudinal.velocity = 0.0f;
    zero.longitudinal.is_defined_acceleration = true;
    zero.longitudinal.acceleration = -params_.max_brake_accel;
    pub_control_->publish(zero);
    pub_gear_->publish(std::make_unique<GearCommand>());
    return;
  }

  if (!intent_fresh()) {
    // deadman: brake to a stop
    Control safe = make_control();
    safe.longitudinal.velocity = 0.0f;
    safe.longitudinal.is_defined_acceleration = true;
    safe.longitudinal.acceleration = -params_.max_brake_accel;
    pub_control_->publish(safe);
    return;
  }

  pub_control_->publish(make_control());
  auto gear = std::make_unique<GearCommand>();
  {
    std::lock_guard<std::mutex> lock(mutex_);
    gear->command = intent_.gear;
  }
  pub_gear_->publish(std::move(gear));
}

void TeleopNode::run_telemetry()
{
  // Placeholder telemetry loop; a real sink (console/WS) plugs in here.
  // Currently just logs a sparse status line to avoid spamming.
  rclcpp::Rate rate(2.0);
  while (rclcpp::ok() && telemetry_running_.load()) {
    double vel = 0.0;
    double steer = 0.0;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      vel = vehicle_.velocity;
      steer = vehicle_.steer_angle;
    }
    RCLCPP_INFO_THROTTLE(
      get_logger(), *get_clock(), 2000,
      "telemetry: v=%.2f m/s steer=%.3f rad", vel, steer);
    rate.sleep();
  }
}

}  // namespace autoware_teleop
