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
from autoware_vehicle_msgs.msg import ControlModeReport
from autoware_vehicle_msgs.msg import GearCommand
from autoware_vehicle_msgs.msg import GearReport
from autoware_vehicle_msgs.msg import SteeringReport
from autoware_vehicle_msgs.msg import VelocityReport

from .schemas import OP_MODE_NAME, OP_MODE_VAL, MANUAL_MODE_VAL, classify_conflict, actual_mode_name

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
class TopicFreshness:
    """Per-topic last-seen + freshness classification (live/late/missing)."""

    last_seen_ms: float = 0.0
    period_ms: float = 100.0
    seen: bool = False

    def classify(self, now_ms: float) -> str:
        if not self.seen:
            return "unseen"
        age = now_ms - self.last_seen_ms
        if age > max(500.0, 5 * self.period_ms):
            return "missing"
        if age > max(150.0, 2 * self.period_ms):
            return "late"
        return "live"


@dataclass
class TelemetrySnapshot:
    """Latest vehicle state, written by the ROS thread, read by the WS thread."""

    velocity: float = 0.0
    steer_angle: float = 0.0
    gear: str = "NEUTRAL"
    vehicle_mode: int | None = None   # raw ControlModeReport.mode
    lock: threading.Lock = field(default_factory=threading.Lock)
    # Per-topic freshness, keyed by report topic (velocity/steering/gear/control_mode).
    freshness: dict[str, TopicFreshness] = field(default_factory=dict)

    def update(self, velocity=None, steer=None, gear=None, vehicle_mode=None):
        now_ms = time.time() * 1000
        with self.lock:
            if velocity is not None:
                self.velocity = velocity
                self.freshness["velocity"].seen = True
                self.freshness["velocity"].last_seen_ms = now_ms
            if steer is not None:
                self.steer_angle = steer
                self.freshness["steering"].seen = True
                self.freshness["steering"].last_seen_ms = now_ms
            if gear is not None:
                self.gear = gear
                self.freshness["gear"].seen = True
                self.freshness["gear"].last_seen_ms = now_ms
            if vehicle_mode is not None:
                self.vehicle_mode = int(vehicle_mode)
                self.freshness["control_mode"].seen = True
                self.freshness["control_mode"].last_seen_ms = now_ms

    def snapshot(self) -> dict:
        now_ms = time.time() * 1000
        with self.lock:
            mode = self.vehicle_mode
            cm_fresh = self.freshness["control_mode"]
            # Treat the mode as unknown if no control_mode sample yet or stale.
            if not cm_fresh.seen:
                actual = None
            elif cm_fresh.classify(now_ms) in ("missing",):
                actual = None
            else:
                actual = mode
            return {
                "velocity": self.velocity,
                "steer_angle": self.steer_angle,
                "gear": self.gear,
                "vehicle_mode": actual,
                "freshness": {
                    k: {"freshness": f.classify(now_ms), "age_ms": round(
                        max(0.0, now_ms - f.last_seen_ms), 1) if f.seen else 0.0}
                    for k, f in self.freshness.items()
                },
            }


class TeleopRosBridge(Node):
    """Publishes intent to the node; subscribes reports for telemetry."""

    def __init__(self, node_name: str = "autoware_teleop_web"):
        super().__init__(node_name)
        self.pub_intent = self.create_publisher(IntentMsg, "~/intent", INTENT_QOS)
        self.telemetry = TelemetrySnapshot(
            freshness={
                "velocity": TopicFreshness(period_ms=100.0),
                "steering": TopicFreshness(period_ms=100.0),
                "gear": TopicFreshness(period_ms=100.0),
                "control_mode": TopicFreshness(period_ms=100.0),
            }
        )
        self.create_subscription(
            VelocityReport, "/vehicle/status/velocity_status",
            self._on_velocity, REPORT_QOS)
        self.create_subscription(
            SteeringReport, "/vehicle/status/steering_status",
            self._on_steering, REPORT_QOS)
        self.create_subscription(
            GearReport, "/vehicle/status/gear_status",
            self._on_gear, REPORT_QOS)
        self.create_subscription(
            ControlModeReport, "/vehicle/status/control_mode",
            self._on_control_mode, REPORT_QOS)

        self._throttle = 0.0
        self._brake = 0.0
        self._steer = 0.0
        self._gear = GearCommand.NEUTRAL
        self._estop = 0
        self._input_mode = 0
        self._source = "web"
        self._sequence = 0
        self._limits = {
            "max_speed_forward": 3.0,
            "max_speed_reverse": 0.5,
            "max_steering_angle": 0.747,
            "max_deceleration": 5.0,
        }
        self._turn = 0
        self._hazard = False
        self._operation_mode = 0
        self._manual_mode = 2
        self._engage = False
        self._test_mode = 0
        self._bp = {
            "enable_mtr": True, "enable_ses": True, "enable_seb": True,
            "send_mode_auto": True, "sim_mode": False, "publish_brake_diag": False,
            "max_speed_forward": 3.0, "max_speed_reverse": 0.5,
            "max_steering_angle": 0.747, "max_deceleration": 5.0,
        }
        self._rate = 10.0
        self._running = False
        self._stream_thread: threading.Thread | None = None

        # ROS2 graph detection (polled periodically).
        self._graph_lock = threading.Lock()
        self._ros2_ok = False          # graph reachable (topics query works)
        self._autoware_present = False # key Autoware control/status topics exist
        self._graph_thread: threading.Thread | None = None
        self._graph_stop = False

    # ---- ROS2 graph detection ----
    def _graph_probe(self):
        """Periodically probe the ROS2 graph. Catches:
        - rclpy graph not usable (no daemon / node not spun yet)
        - Autoware Universe not running (expected topics absent)
        """
        self._graph_stop = False
        while self._running and not self._graph_stop:
            try:
                # get_topic_names_and_types() raises if the graph/context is bad.
                topics = self.get_topic_names_and_types()
                names = {t for t, _ in topics}
                control = "/control/command/control_cmd" in names
                status = "/vehicle/status/velocity_status" in names or \
                    "/vehicle/status/control_mode" in names
                with self._graph_lock:
                    self._ros2_ok = True
                    # Autoware is 'present' when both sides of the vehicle
                    # interface exist (something consumes control + publishes
                    # status). This means the Autoware/vehicle stack is up.
                    self._autoware_present = bool(control and status)
            except Exception:
                with self._graph_lock:
                    self._ros2_ok = False
                    self._autoware_present = False
            time.sleep(2.0)

    def graph_status(self) -> dict:
        """Return the current ROS2 graph detection snapshot."""
        with self._graph_lock:
            return {
                "ros2_ok": self._ros2_ok,
                "autoware_present": self._autoware_present,
            }

    # ---- subscribers ----
    def _on_velocity(self, msg: VelocityReport):
        self.telemetry.update(velocity=float(msg.longitudinal_velocity))

    def _on_steering(self, msg: SteeringReport):
        self.telemetry.update(steer=float(msg.steering_tire_angle))

    def _on_gear(self, msg: GearReport):
        self.telemetry.update(gear=GEAR_REPORT_NAME.get(msg.report, "NEUTRAL"))

    def _on_control_mode(self, msg: ControlModeReport):
        self.telemetry.update(vehicle_mode=msg.mode)

    # ---- intent (called from WS thread) ----
    def set_intent(self, intent: dict) -> None:
        self._throttle = max(-1.0, min(1.0, float(intent.get("throttle", 0.0))))
        self._brake = max(0.0, min(1.0, float(intent.get("brake", 0.0))))
        self._steer = max(-1.0, min(1.0, float(intent.get("steer", 0.0))))
        gear = intent.get("gear", "NEUTRAL")
        self._gear = GEAR_MAP.get(gear, GearCommand.NEUTRAL)
        self._estop = max(0, int(intent.get("estop", 0)))
        self._input_mode = {"raw": 0, "keyboard": 1}.get(
            intent.get("input_mode", "raw"), 0)
        self._source = str(intent.get("source", "web"))[:64] or "web"
        self._sequence = max(0, int(intent.get("sequence", 0)))

        # Authority limits (operator-set ceiling; node clamps to its params).
        bp = intent.get("bridge_params", {})
        self._limits = {
            "max_speed_forward": float(bp.get("max_speed_forward", 3.0)),
            "max_speed_reverse": float(bp.get("max_speed_reverse", 0.5)),
            "max_steering_angle": float(bp.get("max_steering_angle", 0.747)),
            "max_deceleration": float(bp.get("max_deceleration", 5.0)),
        }

        # New fields (light/op-mode/test-mode/bridge params) — cached and
        # forwarded verbatim on the next intent tick.
        self._turn = {"NONE": 0, "LEFT": 1, "RIGHT": 2}.get(
            intent.get("turn_indicator", "NONE"), 0)
        self._hazard = bool(intent.get("hazard", False))
        self._operation_mode = OP_MODE_VAL.get(
            intent.get("operation_mode", "STOP"), 0)
        self._manual_mode = MANUAL_MODE_VAL.get(
            intent.get("manual_control_mode", "VELOCITY"),
            MANUAL_MODE_VAL["VELOCITY"])
        self._engage = bool(intent.get("engage", False))
        self._test_mode = {"manual": 0, "auto": 1, "sim": 2,
                           "mtr_only": 3, "ses_only": 4, "seb_only": 5}.get(
            intent.get("test_mode", "manual"), 0)
        bp = intent.get("bridge_params", {})
        self._bp = {
            "enable_mtr": bool(bp.get("enable_mtr", True)),
            "enable_ses": bool(bp.get("enable_ses", True)),
            "enable_seb": bool(bp.get("enable_seb", True)),
            "send_mode_auto": bool(bp.get("send_mode_auto", True)),
            "sim_mode": bool(bp.get("sim_mode", False)),
            "publish_brake_diag": bool(bp.get("publish_brake_diag", False)),
            "max_speed_forward": float(bp.get("max_speed_forward", 3.0)),
            "max_speed_reverse": float(bp.get("max_speed_reverse", 0.5)),
            "max_steering_angle": float(bp.get("max_steering_angle", 0.747)),
            "max_deceleration": float(bp.get("max_deceleration", 5.0)),
        }

    def set_estop_counter(self, count: int) -> None:
        self._estop = max(0, int(count))

    def get_operation_mode_name(self) -> str:
        return OP_MODE_NAME.get(self._operation_mode, "STOP")

    def get_vehicle_mode(self) -> tuple[str, dict]:
        """Return (actual vehicle mode name, conflict classification).

        The actual mode comes from /vehicle/status/control_mode (the real
        AUTONOMOUS/MANUAL feedback the E-Trike bridge publishes from RT state) —
        the codebase's authoritative 'who is driving' signal. UNKNOWN when there
        is no (or stale) control_mode feedback.
        """
        snap = self.telemetry.snapshot()
        actual = snap.get("vehicle_mode")
        if actual is None:
            return "UNKNOWN", {"conflict": False, "warning": False, "auto_confirmed": False}
        return actual_mode_name(actual), classify_conflict(
            self._operation_mode, self._engage, actual
        )

    # ---- intent stream -> node ----
    def _publish_intent(self):
        msg = IntentMsg()
        msg.throttle = float(self._throttle)
        msg.brake = float(self._brake)
        msg.steer = float(self._steer)
        msg.gear = self._gear
        msg.input_mode = self._input_mode
        msg.source = self._source
        msg.sequence = self._sequence
        msg.turn_indicator = self._turn
        msg.hazard = self._hazard
        msg.operation_mode = self._operation_mode
        msg.manual_control_mode = self._manual_mode
        msg.engage = self._engage
        msg.test_mode = self._test_mode
        bp = self._bp
        msg.enable_mtr = bp["enable_mtr"]
        msg.enable_ses = bp["enable_ses"]
        msg.enable_seb = bp["enable_seb"]
        msg.send_mode_auto = bp["send_mode_auto"]
        msg.sim_mode = bp["sim_mode"]
        msg.publish_brake_diag = bp["publish_brake_diag"]
        msg.max_speed_forward = float(self._limits["max_speed_forward"])
        msg.max_speed_reverse = float(self._limits["max_speed_reverse"])
        msg.max_steering_angle = float(self._limits["max_steering_angle"])
        msg.max_deceleration = float(self._limits["max_deceleration"])
        msg.estop = self._estop
        self.pub_intent.publish(msg)

    def start(self, rate: float = 10.0):
        self._rate = rate
        self._running = True
        self._stream_thread = threading.Thread(target=self._stream_loop, daemon=True)
        self._stream_thread.start()
        self._graph_thread = threading.Thread(target=self._graph_probe, daemon=True)
        self._graph_thread.start()

    def stop(self):
        self._running = False
        self._graph_stop = True
        if self._graph_thread:
            self._graph_thread.join(timeout=2.0)
            self._graph_thread = None
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
