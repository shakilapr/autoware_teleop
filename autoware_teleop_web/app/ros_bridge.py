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

"""Thin rclpy proxy between the FastAPI WebSocket and the teleop node.

The autoware_teleop node is the SINGLE authority publishing /control/command/*.
This bridge only:
  - publishes operator intent to the node's ~/intent topic, and
  - subscribes /vehicle/status/* to forward telemetry to the browser.

The node applies the deadman watchdog and emergency stop regardless of source,
so a stale or disconnected browser cannot leave the vehicle driving.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy

from autoware_teleop_msgs.msg import Intent as IntentMsg
from autoware_vehicle_msgs.msg import GearCommand
from autoware_vehicle_msgs.msg import GearReport
from autoware_vehicle_msgs.msg import SteeringReport
from autoware_vehicle_msgs.msg import VelocityReport

REPORT_QOS = QoSProfile(depth=1)
INTENT_QOS = QoSProfile(depth=10)

# Gear string -> Autoware GearCommand constant
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


@dataclass
class TelemetrySnapshot:
    """Latest vehicle state, written by the ROS thread, read by the WS thread."""

    velocity: float = 0.0
    steer_angle: float = 0.0
    gear: str = "NEUTRAL"
    lock: threading.Lock = field(default_factory=threading.Lock)

    def update(self, velocity=None, steer=None, gear=None):
        with self.lock:
            if velocity is not None:
                self.velocity = velocity
            if steer is not None:
                self.steer_angle = steer
            if gear is not None:
                self.gear = gear

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "velocity": self.velocity,
                "steer_angle": self.steer_angle,
                "gear": self.gear,
            }


class TeleopRosBridge(Node):
    """Publishes intent to the node; subscribes reports for telemetry."""

    def __init__(self, node_name: str = "autoware_teleop_web"):
        super().__init__(node_name)
        self.pub_intent = self.create_publisher(IntentMsg, "~/intent", INTENT_QOS)
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

        self._throttle = 0.0
        self._brake = 0.0
        self._steer = 0.0
        self._gear = GearCommand.NEUTRAL
        self._estop = 0
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

    # ---- intent (called from WS thread) ----
    def set_intent(self, intent: dict) -> None:
        self._throttle = max(-1.0, min(1.0, float(intent.get("throttle", 0.0))))
        self._brake = max(0.0, min(1.0, float(intent.get("brake", 0.0))))
        self._steer = max(-1.0, min(1.0, float(intent.get("steer", 0.0))))
        gear = intent.get("gear", "NEUTRAL")
        self._gear = GEAR_MAP.get(gear, GearCommand.NEUTRAL)
        self._estop = max(0, int(intent.get("estop", 0)))

    def set_estop_counter(self, count: int) -> None:
        self._estop = max(0, int(count))

    # ---- intent stream -> node ----
    def _publish_intent(self):
        msg = IntentMsg()
        msg.throttle = float(self._throttle)
        msg.brake = float(self._brake)
        msg.steer = float(self._steer)
        msg.gear = self._gear
        msg.estop = self._estop
        self.pub_intent.publish(msg)

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
                self._publish_intent()
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
    """Initialize rclpy and create the proxy + spin thread."""
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
