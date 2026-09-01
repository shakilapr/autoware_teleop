#!/usr/bin/env python3
# Copyright 2026 E-Trike Dev. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""rclpy bridge: maps WebSocket intents to ROS topics and back.

This is the thin transport between the FastAPI WebSocket and the Autoware
vehicle-interface topics. It uses the standard Autoware message types and QoS
so it works with any compliant bridge (including both E-Trike bridges).
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy

from autoware_control_msgs.msg import Control, Lateral, Longitudinal
from autoware_vehicle_msgs.msg import GearCommand
from autoware_vehicle_msgs.msg import GearReport
from autoware_vehicle_msgs.msg import SteeringReport
from autoware_vehicle_msgs.msg import VelocityReport
from tier4_vehicle_msgs.msg import VehicleEmergencyStamped

# Command QoS matches both bridges: reliable, volatile, depth 1.
COMMAND_QOS = QoSProfile(
    depth=1,
    reliability=ReliabilityPolicy.RELIABLE,
    durability=DurabilityPolicy.VOLATILE,
)
REPORT_QOS = QoSProfile(depth=1)

# Autoware gear constants
GEAR_MAP = {
    "NEUTRAL": GearCommand.NEUTRAL,
    "DRIVE": GearCommand.DRIVE,
    "REVERSE": GearCommand.REVERSE,
    "PARK": GearCommand.PARK,
}
GEAR_REPORT_NAME = {
    GearReport.NEUTRAL: "NEUTRAL",
    GearReport.DRIVE: "DRIVE",
    GearReport.REVERSE: "REVERSE",
    GearReport.PARK: "PARK",
    GearReport.LOW: "LOW",
}

# Vehicle limits (configurable; defaults match direct_bridge params)
MAX_SPEED_FWD = 3.0
MAX_SPEED_REV = 0.5
MAX_STEER = 0.747
MAX_BRAKE_ACCEL = 5.0


@dataclass
class TelemetrySnapshot:
    """Latest vehicle state, written by the ROS thread, read by the WS thread."""

    velocity: float = 0.0
    steer_angle: float = 0.0
    gear: str = "NEUTRAL"
    emergency: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)

    def update(self, velocity=None, steer=None, gear=None, emergency=None):
        with self.lock:
            if velocity is not None:
                self.velocity = velocity
            if steer is not None:
                self.steer_angle = steer
            if gear is not None:
                self.gear = gear
            if emergency is not None:
                self.emergency = emergency

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "velocity": self.velocity,
                "steer_angle": self.steer_angle,
                "gear": self.gear,
                "emergency": self.emergency,
            }


class TeleopRosBridge(Node):
    """Owns publishers/subscribers and the control stream."""

    def __init__(self, node_name: str = "autoware_teleop_web"):
        super().__init__(node_name)
        self.pub_control = self.create_publisher(Control, "/control/command/control_cmd", COMMAND_QOS)
        self.pub_gear = self.create_publisher(GearCommand, "/control/command/gear_cmd", COMMAND_QOS)
        self.pub_emergency = self.create_publisher(
            VehicleEmergencyStamped, "/control/command/emergency_cmd", COMMAND_QOS)

        self.telemetry = TelemetrySnapshot()
        self.create_subscription(
            VelocityReport, "/vehicle/status/velocity_status",
            self._on_velocity, REPORT_QOS)
        self.create_subscription(
            SteeringReport, "/vehicle/status/steering_status",
            self._on_steering, REPORT_QOS)
        self.create_subscription(
            GearReport, "/vehicle/status/gear_status",
            self._on_gear, REPORT_QOS)

        # Control state (updated by the WS thread; published by the stream thread)
        self._throttle = 0.0
        self._brake = 0.0
        self._steer = 0.0
        self._gear = GearCommand.NEUTRAL
        self._emergency = False
        self._rate = 10.0
        self._running = False
        self._stream_thread: threading.Thread | None = None

    # ---- subscribers ----
    def _on_velocity(self, msg: VelocityReport):
        self.telemetry.update(velocity=float(msg.longitudinal_velocity))

    def _on_steering(self, msg: SteeringReport):
        self.telemetry.update(steer=float(msg.steering_tire_angle))

    def _on_gear(self, msg: GearReport):
        self.telemetry.update(gear=GEAR_REPORT_NAME.get(msg.report, "NEUTRAL"))

    # ---- control state (called from WS thread) ----
    def set_intent(self, intent: dict) -> None:
        self._throttle = max(-1.0, min(1.0, float(intent.get("throttle", 0.0))))
        self._brake = max(0.0, min(1.0, float(intent.get("brake", 0.0))))
        self._steer = max(-1.0, min(1.0, float(intent.get("steer", 0.0))))
        gear = intent.get("gear", "NEUTRAL")
        self._gear = GEAR_MAP.get(gear, GearCommand.NEUTRAL)

    def set_emergency(self, on: bool) -> None:
        self._emergency = bool(on)
        self.telemetry.update(emergency=self._emergency)

    # ---- control stream ----
    def _map_control(self) -> Control:
        msg = Control()
        msg.lateral = Lateral()
        msg.lateral.steering_tire_angle = float(self._steer * MAX_STEER)
        msg.longitudinal = Longitudinal()
        # throttle axis -> forward velocity; brake axis -> negative acceleration
        vel = self._throttle * MAX_SPEED_FWD
        if self._throttle < 0.0:
            vel = self._throttle * MAX_SPEED_REV
        msg.longitudinal.velocity = float(vel)
        if self._brake > 0.0:
            msg.longitudinal.acceleration = float(-self._brake * MAX_BRAKE_ACCEL)
            msg.longitudinal.is_defined_acceleration = True
        else:
            msg.longitudinal.acceleration = 0.0
            msg.longitudinal.is_defined_acceleration = False
        return msg

    def _publish_tick(self):
        if self._emergency:
            self.pub_emergency.publish(VehicleEmergencyStamped(emergency=True))
            # also send zero velocity + neutral
            control = self._map_control()
            control.longitudinal.velocity = 0.0
            self.pub_control.publish(control)
            self.pub_gear.publish(GearCommand(command=GearCommand.NEUTRAL))
            return
        self.pub_control.publish(self._map_control())
        self.pub_gear.publish(GearCommand(command=self._gear))

    def start(self, rate: float = 10.0):
        self._rate = rate
        self._running = True
        self._stream_thread = threading.Thread(target=self._stream_loop, daemon=True)
        self._stream_thread.start()

    def stop(self):
        self._running = False
        if self._stream_thread:
            self._stream_thread.join(timeout=2.0)
            self._stream_thread = None

    def _stream_loop(self):
        period = 1.0 / self._rate
        while self._running:
            try:
                self._publish_tick()
            except Exception:
                pass
            time.sleep(period)


def spin_bridge(bridge: TeleopRosBridge):
    """Spin the node until stop() is called (run in a background thread)."""
    executor = rclpy.executors.SingleThreadedExecutor()
    executor.add_node(bridge)
    try:
        executor.spin()
    finally:
        executor.shutdown()


def create_bridge(rate: float = 10.0) -> tuple[TeleopRosBridge, threading.Thread]:
    """Initialize rclpy and create the bridge + spin thread."""
    if not rclpy.ok():
        rclpy.init()
    bridge = TeleopRosBridge()
    bridge.start(rate=rate)
    spin = threading.Thread(target=spin_bridge, args=(bridge,), daemon=True)
    spin.start()
    return bridge, spin


def shutdown_bridge(bridge: TeleopRosBridge, spin: threading.Thread):
    bridge.stop()
    bridge.destroy_node()
    if rclpy.ok():
        rclpy.shutdown()
