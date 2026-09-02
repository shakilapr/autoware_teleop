import { useTeleop, streamIsStale } from "../stores/teleop";

const fmt = (v: number, d: number) => {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(d);
};

export function StatusStrip() {
  const intent = useTeleop((s) => s.intent);
  const telemetry = useTeleop((s) => s.telemetry);
  const estopArmed = useTeleop((s) => s.estopArmed);
  const setEstop = useTeleop((s) => s.setEstop);
  const setIntent = useTeleop((s) => s.setIntent);
  const connected = useTeleop((s) => s.connected);
  const reconnectAttempts = useTeleop((s) => s.reconnectAttempts);
  const streamQuality = useTeleop((s) => s.streamQuality);
  const v = telemetry.vehicle;
  const req = telemetry.requested;

  const locked = !intent.engage;
  const stale = streamIsStale(streamQuality) || v.freshness === "unseen" || v.freshness === "missing";
  const live = !stale && connected && v.freshness === "live";

  // READY gate: only green when fully live and control is engaged.
  const ready =
    connected && !locked && live && !estopArmed && streamQuality === "live";
  const readyReason = !connected
    ? "Not connected"
    : estopArmed
      ? "ESTOP armed"
      : locked
        ? "Control locked — press ENGAGE"
        : !live
          ? v.freshness === "unseen"
            ? "No telemetry yet"
            : v.freshness === "missing"
              ? "Telemetry missing"
              : "Stream degraded"
          : "OK";

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

  const speed = live ? fmt(v.velocity, 1) : fmt(v.velocity, 1);
  const steer = live ? fmt(v.steer_angle, 2) : fmt(v.steer_angle, 2);
  const ageTxt = v.freshness === "unseen" ? "—" : `${v.age_ms.toFixed(0)} ms`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs">
      <span
        className={`rounded px-2 py-0.5 font-bold text-white ${ready ? "bg-green-600" : "bg-zinc-700"}`}
        title={ready ? "Ready to drive" : readyReason}
      >
        {ready ? "READY" : "NOT READY"}
      </span>

      <span className={`rounded px-2 py-0.5 font-bold text-white ${txState.cls}`}>
        {txState.label}
      </span>

      {!connected && (
        <span className="rounded bg-amber-600/20 px-2 py-0.5 font-semibold text-amber-300"
          title="Reconnecting to backend">
          RECONNECT{reconnectAttempts > 0 ? ` (${reconnectAttempts})` : ""}
        </span>
      )}

      <div className={`flex items-center gap-4 font-mono text-zinc-300 ${stale ? "opacity-60" : ""}`}>
        <span>
          speed <span className="text-zinc-500">cmd {fmt(req.speed, 1)} · fbk {speed}</span>
        </span>
        <span>
          steer <span className="text-zinc-500">cmd {fmt(req.steer, 2)} · fbk {steer}</span>
        </span>
        <span>
          gear <span className="text-zinc-500">{req.gear} / {v.gear}</span>
        </span>
      </div>

      <div className={`flex items-center gap-1.5 text-zinc-400 ${stale ? "opacity-60" : ""}`}>
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
        <span className="text-zinc-600">({ageTxt})</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={stopAll}
          title="Zero axes + neutral + disengage. Safe-release sent to the node."
          className="rounded bg-amber-600/20 px-3 py-1 font-semibold text-amber-300 hover:bg-amber-600/40"
        >
          Stop / release
        </button>
        {estopArmed ? (
          <button
            onClick={() => setEstop(false)}
            title="Clear emergency stop"
            className="rounded border border-zinc-600 px-3 py-1 font-bold text-zinc-300 hover:bg-zinc-700 transition"
          >
            CLEAR ESTOP
          </button>
        ) : (
          <button
            onClick={() => setEstop(true)}
            title="Arm emergency stop"
            className="rounded bg-red-600 px-3 py-1 font-bold text-white hover:bg-red-500 transition"
          >
            ESTOP
          </button>
        )}
      </div>
    </div>
  );
}
