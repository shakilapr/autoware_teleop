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

"""Schema tests for the autoware_teleop WebSocket contract.

These run without ROS (pure Pydantic) so CI can validate the contract quickly.
"""

from pydantic import ValidationError
import pytest

from app.schemas import Intent, Telemetry, ControlIntent, DiscreteIntent, classify_conflict


def test_intent_defaults():
    intent = Intent()
    assert intent.throttle == 0.0
    assert intent.brake == 0.0
    assert intent.steer == 0.0
    assert intent.gear == "NEUTRAL"
    assert intent.estop == 0


def test_intent_validation():
    intent = Intent.model_validate_json(
        '{"throttle": 0.5, "brake": 0.2, "steer": -0.3, "gear": "DRIVE", "estop": 1}')
    assert intent.throttle == 0.5
    assert intent.gear == "DRIVE"


def test_intent_rejects_out_of_range():
    with pytest.raises(ValidationError):
        Intent(throttle=1.5)
    with pytest.raises(ValidationError):
        Intent(steer=-1.5)
    with pytest.raises(ValidationError):
        Intent(brake=-0.1)


def test_intent_rejects_bad_gear():
    with pytest.raises(ValidationError):
        Intent(gear="FLY")


def test_control_intent_bounds():
    c = ControlIntent(throttle=1.0, brake=1.0, steer=-1.0)
    assert c.throttle == 1.0 and c.brake == 1.0 and c.steer == -1.0


def test_discrete_intent_counters():
    d = DiscreteIntent(mode_cycle=3, toggle_auto=1, reset_pose=0, estop=2)
    assert d.mode_cycle == 3
    assert d.estop == 2


def test_telemetry_defaults():
    t = Telemetry()
    assert t.mode.drive_mode == "stop"
    assert t.mode.operation_mode == "STOP"
    assert t.mode.manual_control_mode == "VELOCITY"
    assert t.vehicle.velocity == 0.0
    assert t.timestamp == 0


def test_telemetry_roundtrip():
    t = Telemetry()
    t.vehicle.velocity = 1.5
    t.vehicle.gear = "DRIVE"
    t.vehicle.hazard = True
    t.watchdog_tripped = True
    t.timestamp = 1700000000000
    d = t.model_dump()
    back = Telemetry.model_validate(d)
    assert back.vehicle.velocity == 1.5
    assert back.vehicle.hazard is True
    assert back.watchdog_tripped is True


def test_intent_source_sequence_defaults():
    intent = Intent()
    assert intent.source == "web"
    assert intent.sequence == 0
    assert intent.input_mode == "raw"


def test_intent_source_sequence_set():
    intent = Intent.model_validate_json(
        '{"source": "keyboard", "sequence": 7, "input_mode": "keyboard"}')
    assert intent.source == "keyboard"
    assert intent.sequence == 7
    assert intent.input_mode == "keyboard"


def test_telemetry_freshness_defaults():
    t = Telemetry()
    assert t.vehicle.freshness == "unseen"
    assert t.vehicle.age_ms == 0.0
    assert t.simulated is False
    assert t.requested.speed == 0.0
    assert t.stream.heartbeat_ok is True


def test_telemetry_freshness_roundtrip():
    t = Telemetry()
    t.vehicle.freshness = "late"
    t.vehicle.age_ms = 300.0
    t.simulated = True
    t.requested.speed = 1.2
    t.requested.gear = "DRIVE"
    t.stream.heartbeat_ok = True
    d = t.model_dump()
    back = Telemetry.model_validate(d)
    assert back.vehicle.freshness == "late"
    assert back.vehicle.age_ms == 300.0
    assert back.simulated is True
    assert back.requested.speed == 1.2
    assert back.requested.gear == "DRIVE"
    assert back.stream.heartbeat_ok is True


def _classify(seen, last_seen, now, period_ms=100.0):
    """Mirror of TopicFreshness.classify (avoid rclpy import in CI)."""
    if not seen:
        return "unseen"
    age = now - last_seen
    if age > max(500.0, 5 * period_ms):
        return "missing"
    if age > max(150.0, 2 * period_ms):
        return "late"
    return "live"


def test_topic_freshness_thresholds():
    # live: age 50 ms < 2× period (200 ms)
    assert _classify(True, 1000, 1050) == "live"
    # late: age 250 ms > 2× period (200 ms)
    assert _classify(True, 1000, 1250) == "late"
    # missing: age 600 ms > 5× period (500 ms)
    assert _classify(True, 1000, 1600) == "missing"
    # unseen never seen
    assert _classify(False, 0, 100000) == "unseen"


def test_ping_envelope_is_telemetry_free():
    """The WS coalescing heartbeat sends a lightweight ping that carries no
    telemetry fields (vehicle/mode/target), so the frontend short-circuits on
    type=ping instead of parsing a stale full frame."""
    ping = {
        "type": "ping",
        "stream": {"sequence": 4, "heartbeat_ok": True},
    }
    assert ping.get("type") == "ping"
    assert ping["stream"]["sequence"] == 4
    # A ping must never look like live vehicle data: no vehicle/mode present.
    assert "vehicle" not in ping
    assert "mode" not in ping
    assert "requested" not in ping


def test_modestate_new_fields_defaults():
    t = Telemetry()
    assert t.mode.actual_vehicle_mode == "UNKNOWN"
    assert t.mode.autoware_conflict is False
    assert t.mode.autoware_warning is False
    assert t.mode.autoware_auto_confirmed is False


def test_classify_conflict_truth_table():
    """Conflict/authority classification must match the rig's control authority:
    /vehicle/status/control_mode == AUTONOMOUS means Autoware has the vehicle."""
    # control_mode constants used by the E-Trike bridge
    AUTO = 1        # ControlModeReport.AUTONOMOUS
    MANUAL = 4      # ControlModeReport.MANUAL
    DISENGAGED = 5  # ControlModeReport.DISENGAGED
    STOP, FULL, SIM, REMOTE = 0, 1, 2, 3

    # No/unknown vehicle mode -> no flags, never a false red.
    none = classify_conflict(REMOTE, True, None)
    assert none == {"conflict": False, "warning": False, "auto_confirmed": False}

    # Vehicle MANUAL/DISENGAGED -> Autoware is not in control.
    assert classify_conflict(REMOTE, True, MANUAL)["conflict"] is False
    assert classify_conflict(REMOTE, False, DISENGAGED)["warning"] is False

    # REMOTE + engaged + AUTO -> RED conflict (drive-authority fight).
    red = classify_conflict(REMOTE, True, AUTO)
    assert red["conflict"] is True and red["warning"] is False

    # REMOTE + disengaged + AUTO -> amber warning (ENGAGE would conflict).
    amber = classify_conflict(REMOTE, False, AUTO)
    assert amber["warning"] is True and amber["conflict"] is False

    # FULL/SIM + AUTO -> confirmed (Autoware is driving, viewing only).
    for op in (FULL, SIM):
        conf = classify_conflict(op, False, AUTO)
        assert conf["auto_confirmed"] is True
        assert conf["conflict"] is False and conf["warning"] is False

    # STOP + AUTO -> nothing (no drive path either way).
    assert classify_conflict(STOP, False, AUTO) == {
        "conflict": False, "warning": False, "auto_confirmed": False}
