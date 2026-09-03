import { useTeleop, streamIsStale } from "../stores/teleop";
import { Terminal } from "lucide-react";

/**
 * ROS2 command output — the /control/command/* topics this teleop node
 * publishes (the Autoware Universe interface it mimics).
 * Clean, borderless list format per operator ergonomic standards.
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

  const rows: Array<{
    topic: string;
    type: string;
    val: string;
    live: boolean;
    danger?: boolean;
    planned?: boolean;
  }> = [
    {
      topic: "/control/command/control_cmd",
      type: "Control",
      val: `v ${fmt(cmdSpeed)} m/s · steer ${fmt(cmdSteer, 3)} rad · accel ${fmt(cmdAccel)} m/s²`,
      live: !locked && !estop,
    },
    {
      topic: "/control/command/gear_cmd",
      type: "GearCommand",
      val: cmdGear,
      live: !locked && !estop,
    },
    {
      topic: "/control/command/turn_indicators_cmd",
      type: "TurnIndicatorsCommand",
      val: turn,
      live: !estop,
      planned: true, // node does not yet publish this topic
    },
    {
      topic: "/control/command/hazard_lights_cmd",
      type: "HazardLightsCommand",
      val: intent.hazard ? "ON" : "OFF",
      live: !estop,
      planned: true, // node does not yet publish this topic
    },
    {
      topic: "/control/command/emergency_cmd",
      type: "VehicleEmergencyStamped",
      val: estop ? "EMERGENCY (armed)" : "clear",
      live: estop,
      danger: estop,
    },
  ];

  return (
    <div className={`flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-md transition h-full ${dim ? "opacity-75" : ""}`}>
      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400 shrink-0" />
            <h2 className="text-base font-bold text-zinc-100">ROS 2 Command Output</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-semibold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
              10 Hz TX
            </span>
            <span className="text-xs font-medium text-zinc-500 hidden sm:inline">Autoware Interface</span>
          </div>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {rows.map((r) => (
            <div
              key={r.topic}
              className="flex items-center justify-between py-2 px-1.5 hover:bg-zinc-800/30 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    r.danger
                      ? "bg-red-500 animate-ping"
                      : r.live
                        ? "bg-emerald-500 shadow-sm shadow-emerald-500/80"
                        : r.planned
                          ? "bg-zinc-600"
                          : "bg-zinc-700"
                  }`}
                />
                <span className="font-mono text-xs font-semibold text-blue-400 truncate" title={r.topic}>
                  {r.topic}
                </span>
                {r.planned && (
                  <span className="rounded bg-zinc-800/80 px-1.5 py-0.2 text-[9px] font-semibold text-zinc-400 border border-zinc-700/60 shrink-0" title="Planned upstream interface">
                    PLANNED
                  </span>
                )}
              </div>
              <div className="font-mono text-xs font-semibold text-zinc-200 text-right shrink-0">
                {r.val}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
