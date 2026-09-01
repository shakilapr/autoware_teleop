# Operator intent for one control tick (mirrors autoware_teleop_web/app/schemas.py).
# The node subscribes to this and is the single authority publishing the
# /control/command topics, applying the deadman watchdog to any source
# (keyboard or web).

builtin_interfaces/Time stamp

# Continuous drive axes, each in [-1, 1].
float32 throttle   # accelerator axis
float32 brake      # brake axis, [0, 1]
float32 steer      # steering axis, [-1, 1]

# Gear request.
uint8 gear         # autoware_vehicle_msgs/GearCommand constants

# Emergency stop. Odd = arm, even = disarm (monotonic toggle counter).
uint32 estop
