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

"""Pydantic schemas for the autoware_teleop WebSocket contract.

These mirror the Zod schemas on the React frontend. The intent is sent by the
browser to drive the vehicle; telemetry is sent back to render the dashboard.
"""

from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Intent (client -> node), one object per control tick
# ---------------------------------------------------------------------------
GearLiteral = Literal["PARK", "DRIVE", "REVERSE", "NEUTRAL"]
InputModeLiteral = Literal["raw", "keyboard"]
OperationModeLiteral = Literal["STOP", "AUTONOMOUS", "LOCAL", "REMOTE"]
ManualModeLiteral = Literal["PEDALS", "ACCELERATION", "VELOCITY"]
TurnLiteral = Literal["NONE", "LEFT", "RIGHT"]
TestModeLiteral = Literal["manual", "auto", "sim", "mtr_only", "ses_only", "seb_only"]


class BridgeParams(BaseModel):
    enable_mtr: bool = True
    enable_ses: bool = True
    enable_seb: bool = True
    send_mode_auto: bool = True
    sim_mode: bool = False
    publish_brake_diag: bool = False
    max_speed_forward: float = 3.0
    max_speed_reverse: float = 0.5
    max_steering_angle: float = 0.747
    max_deceleration: float = 5.0


class ControlIntent(BaseModel):
    """Continuous drive axes. Each in [-1, 1]; the gateway maps to SI units."""

    throttle: float = Field(default=0.0, ge=-1.0, le=1.0,
                            description="accelerator axis, -1..1")
    brake: float = Field(default=0.0, ge=0.0, le=1.0,
                         description="brake axis, 0..1")
    steer: float = Field(default=0.0, ge=-1.0, le=1.0,
                         description="steering axis, -1..1")


class DiscreteIntent(BaseModel):
    """Discrete operator actions. Monotonic counters: increment to trigger.

    A client increments a counter to fire an action; it does not hold a level,
    so a replay or duplicate is naturally ignored by the node.
    """

    mode_cycle: int = Field(default=0, ge=0, description="cycle drive mode (M)")
    toggle_auto: int = Field(default=0, ge=0, description="toggle auto/remote (Z)")
    reset_pose: int = Field(default=0, ge=0, description="seed initial pose (R)")
    estop: int = Field(default=0, ge=0, description="toggle emergency stop")


class Intent(BaseModel):
    """Full operator intent for one control tick."""

    throttle: float = Field(default=0.0, ge=-1.0, le=1.0)
    brake: float = Field(default=0.0, ge=0.0, le=1.0)
    steer: float = Field(default=0.0, ge=-1.0, le=1.0)
    gear: GearLiteral = Field(default="NEUTRAL")
    input_mode: InputModeLiteral = Field(default="raw")
    turn_indicator: TurnLiteral = Field(default="NONE")
    hazard: bool = False
    operation_mode: OperationModeLiteral = Field(default="STOP")
    manual_control_mode: ManualModeLiteral = Field(default="VELOCITY")
    engage: bool = False
    test_mode: TestModeLiteral = Field(default="manual")
    bridge_params: BridgeParams = BridgeParams()
    mode_cycle: int = 0
    toggle_auto: int = 0
    reset_pose: int = 0
    estop: int = 0
    source: str = Field(default="web", description="producer identity")
    sequence: int = Field(default=0, ge=0, description="monotonic per source")


# ---------------------------------------------------------------------------
# Telemetry (node -> client), every control tick
# ---------------------------------------------------------------------------
class ModeState(BaseModel):
    operation_mode: OperationModeLiteral = "STOP"     # STOP / AUTONOMOUS / LOCAL / REMOTE
    manual_control_mode: ManualModeLiteral = "VELOCITY"
    drive_mode: str = "stop"                 # active drive mode
    mode_status: str = ""


class VehicleState(BaseModel):
    velocity: float = 0.0              # m/s
    steer_angle: float = 0.0           # rad
    gear: GearLiteral = "NEUTRAL"
    turn_indicator: TurnLiteral = "NONE"
    hazard: bool = False
    # Per-value freshness (live/late/missing/unseen/invalid) + age in ms.
    freshness: str = "unseen"
    age_ms: float = 0.0


class TargetState(BaseModel):
    target_velocity: float = 0.0       # m/s
    target_acceleration: float = 0.0   # m/s^2
    target_steer: float = 0.0          # rad


class RequestedState(BaseModel):
    """Commanded target for the cmd-vs-fbk split (what the operator asked for)."""

    speed: float = 0.0                 # m/s (shaped)
    steer: float = 0.0                 # rad
    gear: GearLiteral = "NEUTRAL"


class StreamState(BaseModel):
    """WS liveness/sequence for stream-health (heartbeat)."""

    sequence: int = 0
    heartbeat_ok: bool = True


class ShiftState(BaseModel):
    shift_state: str = ""
    pending_gear: str = ""


class Telemetry(BaseModel):
    """Full telemetry snapshot pushed to the browser each control tick."""

    mode: ModeState = ModeState()
    vehicle: VehicleState = VehicleState()
    target: TargetState = TargetState()
    shift: ShiftState = ShiftState()
    test_mode: TestModeLiteral = "manual"
    watchdog_tripped: bool = False
    info: str = ""
    timestamp: int = 0                  # ms epoch
    # Sim provenance: synthetic reports carry a flag so the UI can badge them.
    simulated: bool = False
    # Commanded target + stream liveness.
    requested: RequestedState = RequestedState()
    stream: StreamState = StreamState()
