# Operator intent for one control tick (mirrors autoware_teleop_web/app/schemas.py).
# The node subscribes to this and is the single authority publishing the
# /control/command topics, applying the deadman watchdog to any source
# (keyboard or web).

builtin_interfaces/Time stamp

# Producer identity + ordering (one active producer; stale/regressed rejected).
string source          # e.g. "web", "keyboard", "terminal"
uint32 sequence        # monotonic per source

# Continuous drive axes, each in [-1, 1].
float32 throttle   # accelerator axis
float32 brake      # brake axis, [0, 1]
float32 steer      # steering axis, [-1, 1]

# Input mode: raw (sliders) or keyboard (WASD).
uint8 input_mode   # 0=raw 1=keyboard

# Gear request.
uint8 gear         # autoware_vehicle_msgs/GearCommand constants

# Lights.
uint8 turn_indicator  # 0=NONE 1=LEFT 2=RIGHT (autoware_vehicle_msgs TurnIndicatorsCommand)
bool hazard

# Operation / manual control modes (ADAPI semantics; direct gateway ignores).
uint8 operation_mode   # 0=STOP 1=AUTONOMOUS 2=LOCAL 3=REMOTE
uint8 manual_control_mode  # 0=PEDALS 1=ACCELERATION 2=VELOCITY
bool engage

# Test-mode profile + bridge params (direct gateway / E-Trike bridges).
uint8 test_mode        # 0=manual 1=auto 2=sim 3=mtr_only 4=ses_only 5=seb_only
bool enable_mtr
bool enable_ses
bool enable_seb
bool send_mode_auto
bool sim_mode
bool publish_brake_diag

# Authority limits (operator-set ceiling, clamped in the node to the param max).
float32 max_speed_forward
float32 max_speed_reverse
float32 max_steering_angle
float32 max_deceleration

# Emergency stop. Odd = arm, even = disarm (monotonic toggle counter).
uint32 estop
