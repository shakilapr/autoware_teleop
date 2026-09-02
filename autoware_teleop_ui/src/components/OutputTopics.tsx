import { useTeleop, streamIsStale } from "../stores/teleop";

/**
 * ROS2 command output — the /control/command/* topics this teleop node
 * publishes (the Autoware Universe interface it mimics).
 */
export function OutputTopics() {
  const intent = useTeleop((s) => s.intent);
  const estopArmed = useTeleop((s) => s.estopArmed);
  const connected = useTeleop((s) => s.connected);
  const streamQuality = useTeleop((s) => s.streamQuality);

  const locked = !intent.engage;
  const dim = !connected || streamIsStale(streamQuality);

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
    <div className={`mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-md transition ${dim ? "opacity-75" : ""}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          ROS 2 Command Output
        </h2>
        <span className="text-xs font-medium text-zinc-400">Autoware Universe Control Interface</span>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.topic}
            className="flex flex-col md:flex-row md:items-center justify-between gap-1.5 rounded-lg bg-zinc-950/60 px-3 py-2 font-mono text-xs border border-zinc-850"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className={`h-2 w-2 shrink-0 rounded-full ${r.danger ? "bg-red-500 animate-ping" : r.live ? "bg-emerald-500 shadow-sm shadow-emerald-500/80" : "bg-zinc-600"}`} />
              <span className="font-semibold text-blue-400">{r.topic}</span>
              <span className="hidden xl:inline text-zinc-500 text-[11px] font-sans">({r.type})</span>
            </div>
            <div className="font-semibold text-zinc-100 md:text-right text-left pl-4 md:pl-0">
              {r.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

