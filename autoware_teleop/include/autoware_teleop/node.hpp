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

#ifndef AUTOWARE_TELEOP__NODE_HPP_
#define AUTOWARE_TELEOP__NODE_HPP_

#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

#include <rclcpp/rclcpp.hpp>
#include <rclcpp_lifecycle/lifecycle_node.hpp>

#include <autoware_control_msgs/msg/control.hpp>
#include <autoware_vehicle_msgs/msg/gear_command.hpp>
#include <autoware_vehicle_msgs/msg/gear_report.hpp>
#include <autoware_vehicle_msgs/msg/steering_report.hpp>
#include <autoware_vehicle_msgs/msg/velocity_report.hpp>
#include <tier4_vehicle_msgs/msg/vehicle_emergency_stamped.hpp>
#include <autoware_teleop_msgs/msg/intent.hpp>
namespace autoware_teleop
{

/// Parameters for the teleop node (immutable after configure).
struct TeleopParams
{
  double control_rate{10.0};        // Hz
  double arrival_timeout_ms{500.0}; // deadman watchdog
  double max_speed_forward{3.0};
  double max_speed_reverse{0.5};
  double max_steering_angle{0.747};
  double max_brake_accel{5.0};
  std::string gear_initial{"NEUTRAL"};
};

/// Operator intent for one control tick.
struct Intent
{
  double throttle{0.0};
  double brake{0.0};
  double steer{0.0};
  uint8_t gear{autoware_vehicle_msgs::msg::GearCommand::NEUTRAL};
  bool estop{false};
  int64_t timestamp_ms{0};
  uint8_t input_mode{0};      // 0=raw 1=keyboard (node-enforced)
  bool engage{false};         // control lock
  uint8_t operation_mode{0};  // 0=STOP 1=FULL 2=SIM 3=REMOTE
  uint32_t sequence{0};       // monotonic per source
  std::string source;         // producer identity
  // Authority limits (operator-set ceiling; node clamps to param max).
  double max_speed_forward{0.0};   // 0 = use param default
  double max_speed_reverse{0.0};
  double max_steering_angle{0.0};
  double max_brake_accel{0.0};
};

/// Vehicle state snapshot from the report topics.
struct VehicleState
{
  double velocity{0.0};
  double steer_angle{0.0};
  uint8_t gear{autoware_vehicle_msgs::msg::GearReport::NEUTRAL};
};

/// Teleop lifecycle node (direct gateway: /control/command/* + /vehicle/status/*).
class TeleopNode : public rclcpp_lifecycle::LifecycleNode
{
public:
  explicit TeleopNode(const rclcpp::NodeOptions & options = rclcpp::NodeOptions());
  ~TeleopNode() override;

  CallbackReturn on_configure(const rclcpp_lifecycle::State & prev) override;
  CallbackReturn on_activate(const rclcpp_lifecycle::State & prev) override;
  CallbackReturn on_deactivate(const rclcpp_lifecycle::State & prev) override;
  CallbackReturn on_cleanup(const rclcpp_lifecycle::State & prev) override;
  CallbackReturn on_shutdown(const rclcpp_lifecycle::State & prev) override;

  /// Set the latest operator intent (thread-safe; from keyboard or WS).
  void set_intent(const Intent & intent);

  /// Force emergency stop on/off (thread-safe).
  void set_emergency(bool on);

private:
  // --- publishers / subscribers ---
  rclcpp_lifecycle::LifecyclePublisher<autoware_control_msgs::msg::Control>::SharedPtr
    pub_control_;
  rclcpp_lifecycle::LifecyclePublisher<autoware_vehicle_msgs::msg::GearCommand>::SharedPtr
    pub_gear_;
  rclcpp_lifecycle::LifecyclePublisher<tier4_vehicle_msgs::msg::VehicleEmergencyStamped>::SharedPtr
    pub_emergency_;

  rclcpp::Subscription<autoware_vehicle_msgs::msg::VelocityReport>::SharedPtr sub_velocity_;
  rclcpp::Subscription<autoware_vehicle_msgs::msg::SteeringReport>::SharedPtr sub_steering_;
  rclcpp::Subscription<autoware_vehicle_msgs::msg::GearReport>::SharedPtr sub_gear_;
  rclcpp::Subscription<autoware_teleop_msgs::msg::Intent>::SharedPtr sub_intent_;

  // --- control timer + telemetry thread ---
  rclcpp::TimerBase::SharedPtr timer_;
  std::thread telemetry_thread_;
  std::atomic<bool> telemetry_running_{false};

  // --- shared state ---
  std::mutex mutex_;
  Intent intent_;
  VehicleState vehicle_;
  std::atomic<bool> emergency_{false};
  std::atomic<int64_t> last_intent_ms_{0};
  // Test-mode / bridge-param state (from Intent)
  std::atomic<uint8_t> test_mode_{0};
  std::atomic<bool> enable_mtr_{true};
  std::atomic<bool> enable_ses_{true};
  std::atomic<bool> enable_seb_{true};
  std::atomic<bool> sim_mode_{false};
  // Ownership: last accepted sequence + source for stale/regressed rejection.
  uint32_t last_sequence_{0};
  std::string active_source_;
  // Resolved authority limits (param cap enforced on set).
  double limit_fwd_{0.0};
  double limit_rev_{0.0};
  double limit_steer_{0.0};
  double limit_brake_{0.0};

  TeleopParams params_;

  // --- internals ---
  void load_parameters();
  void on_timer();
  void run_telemetry();
  void on_velocity(const autoware_vehicle_msgs::msg::VelocityReport::SharedPtr msg);
  void on_steering(const autoware_vehicle_msgs::msg::SteeringReport::SharedPtr msg);
  void on_gear(const autoware_vehicle_msgs::msg::GearReport::SharedPtr msg);
  void on_intent(const autoware_teleop_msgs::msg::Intent::SharedPtr msg);
  autoware_control_msgs::msg::Control make_control();
  autoware_control_msgs::msg::Control make_safe_control();
  bool intent_fresh() const;
  void resolve_limits(const Intent & intent);
};

}  // namespace autoware_teleop

#endif  // AUTOWARE_TELEOP__NODE_HPP_
