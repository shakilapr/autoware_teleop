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
  const int64_t now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::steady_clock::now().time_since_epoch()).count();

  {
    std::lock_guard<std::mutex> lock(mutex_);

    // One-active-producer + stale/regressed rejection. A regressed sequence from
    // the same source is a duplicate/out-of-order replay — not a command.
    const std::string source = msg->source.empty() ? "web" : msg->source;
    if (source == active_source_) {
      if (msg->sequence < last_sequence_) {
        RCLCPP_WARN_THROTTLE(
          get_logger(), *get_clock(), 2000,
          "Stale intent seq %u < %u (source %s) ignored", msg->sequence,
          last_sequence_, source.c_str());
        return;
      }
    } else {
      // Switching producers: release the prior stream and adopt the new one.
      RCLCPP_INFO(
        get_logger(), "Intent source switched %s -> %s (releasing prior stream)",
        active_source_.empty() ? "none" : active_source_.c_str(), source.c_str());
      active_source_ = source;
      last_sequence_ = 0;
    }
    last_sequence_ = msg->sequence;

    Intent intent;
    intent.throttle = msg->throttle;
    intent.brake = msg->brake;
    intent.steer = msg->steer;
    intent.gear = msg->gear;
    intent.estop = (msg->estop % 2) == 1;   // odd = armed
    intent.input_mode = msg->input_mode;     // 0=raw 1=keyboard
    intent.engage = msg->engage;
    intent.sequence = msg->sequence;
    intent.source = source;
    intent.max_speed_forward = msg->max_speed_forward;
    intent.max_speed_reverse = msg->max_speed_reverse;
    intent.max_steering_angle = msg->max_steering_angle;
    intent.max_brake_accel = msg->max_deceleration;
    intent.timestamp_ms = now_ms;

    intent_ = intent;
    resolve_limits(intent);
    // Bridge test-mode toggles: the node routes these to the direct gateway by
    // selecting which actuators to command. sim_mode forces zero commanded
    // motion (actuators stay off) while still exercising the loop.
    test_mode_ = msg->test_mode;
    enable_mtr_ = msg->enable_mtr;
    enable_ses_ = msg->enable_ses;
    enable_seb_ = msg->enable_seb;
    sim_mode_ = msg->sim_mode;
  }
  last_intent_ms_.store(now_ms, std::memory_order_relaxed);
  emergency_.store(intent_.estop, std::memory_order_relaxed);
}

void TeleopNode::resolve_limits(const Intent & intent)
{
  // Operator-set ceiling, clamped to the firmware/parameter cap. A zero field
  // means "use the param default". Never exceed params_.
  limit_fwd_ = intent.max_speed_forward > 0.0
    ? std::min(intent.max_speed_forward, params_.max_speed_forward)
    : params_.max_speed_forward;
  limit_rev_ = intent.max_speed_reverse > 0.0
    ? std::min(intent.max_speed_reverse, params_.max_speed_reverse)
    : params_.max_speed_reverse;
  limit_steer_ = intent.max_steering_angle > 0.0
    ? std::min(intent.max_steering_angle, params_.max_steering_angle)
    : params_.max_steering_angle;
  limit_brake_ = intent.max_brake_accel > 0.0
    ? std::min(intent.max_brake_accel, params_.max_brake_accel)
    : params_.max_brake_accel;
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

  // sim_mode: exercise the loop but command no motion.
  const bool sim = sim_mode_.load(std::memory_order_relaxed);
  const bool mtr_on = enable_mtr_.load(std::memory_order_relaxed);
  const bool ses_on = enable_ses_.load(std::memory_order_relaxed);

  // Control lock (engage): node-enforced, never trusts the browser to have
  // disabled a control. While locked, output is zero velocity / neutral.
  const bool locked = !intent_.engage;

  // Input-mode gate (node-side): in keyboard mode only the discrete keyboard
  // axes {-1,0,1} are valid. Any continuous slider value is zeroed so a stale
  // slider cannot drive the vehicle while the operator is on the keyboard.
  double throttle = intent_.throttle;
  double brake = intent_.brake;
  double steer = intent_.steer;
  if (intent_.input_mode == 1) {  // keyboard
    const auto discrete = [](double v) {
      return (v == -1.0 || v == 0.0 || v == 1.0) ? v : 0.0;
    };
    throttle = discrete(throttle);
    steer = discrete(steer);
    brake = discrete(brake);
  }
  if (locked) {
    throttle = 0.0;
    brake = 0.0;
    steer = 0.0;
  }

  msg.lateral.steering_tire_angle = static_cast<float>(
    ses_on && !sim ? steer * limit_steer_ : 0.0);
  double vel = 0.0;
  if (mtr_on && !sim) {
    vel = throttle >= 0.0 ? throttle * limit_fwd_ : throttle * limit_rev_;
  }
  msg.longitudinal.velocity = static_cast<float>(vel);
  if (!sim && brake > 0.0) {
    msg.longitudinal.acceleration = static_cast<float>(-brake * limit_brake_);
    msg.longitudinal.is_defined_acceleration = true;
  } else {
    msg.longitudinal.acceleration = 0.0f;
    msg.longitudinal.is_defined_acceleration = false;
  }
  return msg;
}

Control TeleopNode::make_safe_control()
{
  // Zero velocity + defined max braking — the fail-closed command the node
  // publishes on lock, deadman, source switch, or release.
  Control msg;
  msg.longitudinal.velocity = 0.0f;
  msg.longitudinal.acceleration = static_cast<float>(-params_.max_brake_accel);
  msg.longitudinal.is_defined_acceleration = true;
  msg.lateral.steering_tire_angle = 0.0f;
  return msg;
}

void TeleopNode::on_timer()
{
  if (emergency_.load(std::memory_order_relaxed)) {
    auto emg = std::make_unique<VehicleEmergencyStamped>();
    emg->emergency = true;
    pub_emergency_->publish(std::move(emg));

    pub_control_->publish(make_safe_control());
    pub_gear_->publish(std::make_unique<GearCommand>());
    return;
  }

  if (!intent_fresh()) {
    // deadman: brake to a stop with an explicit safe frame + neutral gear.
    pub_control_->publish(make_safe_control());
    pub_gear_->publish(std::make_unique<GearCommand>());
    return;
  }

  pub_control_->publish(make_control());
  auto gear = std::make_unique<GearCommand>();
  {
    std::lock_guard<std::mutex> lock(mutex_);
    gear->command = !intent_.engage ? autoware_vehicle_msgs::msg::GearCommand::NEUTRAL
                                    : intent_.gear;
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
