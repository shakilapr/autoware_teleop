import { useTeleop } from "../stores/teleop";

/**
 * Compact status strip — TX state, ESTOP, and Stop-all.
 * Mirrors the Control Toolkit's vehicle-card + stop-all-motion panel,
 * kept inside the single viewport.
 */
export function StatusStrip() {
  const intent = useTeleop((s) => s.intent);
  const telemetry = useTeleop((s) => s.telemetry);
  const estopArmed = useTeleop((s) => s.estopArmed);
  const toggleEstop = useTeleop((s) => s.toggleEstop);
  const setIntent = useTeleop((s) => s.setIntent);
  const v = telemetry.vehicle;
  const req = telemetry.requested;

  const locked = !intent.engage;
  const txState = estopArmed
    ? { label: "ESTOP", cls: "bg-red-600" }
    : locked
      ? { label: "LOCKED", cls: "bg-zinc-600" }
      : telemetry.simulated
        ? { label: "SIM", cls: "bg-blue-600" }
        : { label: "ARMED", cls: "bg-green-600" };

  const stopAll = () => {
    // Explicit safe release: zero axes + neutral + engage off (node publishes
    // an explicit safe frame on the next tick).
    setIntent({
      throttle: 0, brake: 0, steer: 0, gear: "NEUTRAL", engage: false,
    });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs">
      <span className={`rounded px-2 py-0.5 font-bold text-white ${txState.cls}`}>
        {txState.label}
      </span>

      <div className="flex items-center gap-4 font-mono text-zinc-300">
        <span>
          speed <span className="text-zinc-500">cmd {req.speed.toFixed(1)} · fbk {v.velocity.toFixed(1)}</span>
        </span>
        <span>
          steer <span className="text-zinc-500">cmd {req.steer.toFixed(2)} · fbk {v.steer_angle.toFixed(2)}</span>
        </span>
        <span>
          gear <span className="text-zinc-500">{req.gear} / {v.gear}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-zinc-400">
        <span className="text-zinc-500">fresh</span>
        <span
          className={
            v.freshness === "live"
              ? "text-green-400"
              : v.freshness === "late"
                ? "text-amber-400"
                : v.freshness === "missing"
                  ? "text-red-400"
                  : "text-zinc-600"
          }
        >
          {v.freshness}
        </span>
        <span className="text-zinc-600">({v.age_ms.toFixed(0)} ms)</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={stopAll}
          className="rounded bg-zinc-800 px-3 py-1 font-semibold text-zinc-200 hover:bg-zinc-700"
        >
          Stop all / release
        </button>
        <button
          onClick={toggleEstop}
          className={`rounded px-3 py-1 font-bold transition ${
            estopArmed ? "bg-red-600 text-white" : "bg-zinc-800 text-red-400 hover:bg-zinc-700"
          }`}
        >
          ESTOP
        </button>
      </div>
    </div>
  );
}
