import { useTeleop, streamIsStale } from "../stores/teleop";

/**
 * ROS2 command output — the /control/command/* topics this teleop node
 * publishes (the Autoware Universe interface it mimics). Values shown are the
 * commanded (requested) values the node is asked to publish, with the
 * node-enforced lock (NEUTRAL/zeros) applied, NOT measured feedback.
 */
export function OutputTopics() {
  const intent = useTeleop((s) => s.intent);
  const estopArmed = useTeleop((s) => s.estopArmed);
  const connected = useTeleop((s) => s.connected);
  const streamQuality = useTeleop((s) => s.streamQuality);

  const locked = !intent.engage;
  const dim = !connected || streamIsStale(streamQuality);

  // Node semantics (mirrors make_control()): axes are scaled by the clamp; while
  // locked the node forces zeros + NEUTRAL.
  const bp = intent.bridge_params;
  const effThrottle = locked ? 0 : intent.throttle;
  const effBrake = locked ? 0 : intent.brake;
  const effSteer = locked ? 0 : intent.steer;
  const cmdSpeed =
    effThrottle >= 0
      ? effThrottle * bp.max_speed_forward
      : effThrottle * bp.max_speed_reverse;
  const cmdSteer = effSteer * bp.max_steering_angle;
  const cmdAccel = effBrake > 0 ? -effBrake * bp.max_deceleration : 0;
  const cmdGear = locked ? "NEUTRAL" : intent.gear;
  const estop = estopArmed;
  const turn = estop ? "NONE" : intent.turn_indicator;

  const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

  const rows = [
    {
      topic: "/control/command/control_cmd",
      type: "autoware_control_msgs/msg/Control",
      val: `v ${fmt(cmdSpeed)} m/s · steer ${fmt(cmdSteer, 3)} rad · accel ${fmt(cmdAccel)} m/s²`,
      live: !locked && !estop,
    },
    {
      topic: "/control/command/gear_cmd",
      type: "autoware_vehicle_msgs/msg/GearCommand",
      val: cmdGear,
      live: !locked && !estop,
    },
    {
      topic: "/control/command/turn_indicators_cmd",
      type: "autoware_vehicle_msgs/msg/TurnIndicatorsCommand",
      val: turn,
      live: !estop,
    },
    {
      topic: "/control/command/hazard_lights_cmd",
      type: "autoware_vehicle_msgs/msg/HazardLightsCommand",
      val: intent.hazard ? "ON" : "OFF",
      live: !estop,
    },
    {
      topic: "/control/command/emergency_cmd",
      type: "tier4_vehicle_msgs/msg/VehicleEmergencyStamped",
      val: estop ? "EMERGENCY (armed)" : "clear",
      live: estop,
      danger: estop,
    },
  ];

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 p-3 ${dim ? "opacity-70" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">ROS2 command output</h2>
        <span className="text-[10px] text-zinc-500">topics published to mimic Autoware Universe</span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.topic} className="flex items-center gap-2 font-mono text-[11px]">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.danger ? "bg-red-500" : r.live ? "bg-emerald-500" : "bg-zinc-600"}`} />
            <span className="shrink-0 text-blue-400">{r.topic}</span>
            <span className="hidden shrink-0 text-zinc-600 lg:inline">{r.type}</span>
            <span className="ml-auto truncate text-right text-zinc-200">{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
