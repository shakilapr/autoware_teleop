import { useTeleop } from "../stores/teleop";

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

  const locked = !intent.engage;
  const live = connected && streamQuality === "live" && v.freshness === "live";

  // READY gate: only green when fully live and control is engaged.
  const ready =
    connected && !locked && live && !estopArmed && streamQuality === "live";
  const reasons: string[] = [];
  if (!connected) reasons.push("Not connected");
  if (estopArmed) reasons.push("ESTOP armed");
  if (locked) reasons.push("Control locked — press ENGAGE");
  if (connected && streamQuality !== "live") reasons.push("Stream degraded");
  if (connected && v.freshness === "unseen") reasons.push("No telemetry yet");
  if (connected && v.freshness === "missing") reasons.push("Telemetry missing");
  const readyReason = reasons.length ? reasons.join(" · ") : "OK";

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

      <span
        className={`rounded px-2 py-0.5 font-medium ${
          v.freshness === "live"
            ? "bg-green-600/20 text-green-300"
            : v.freshness === "late"
              ? "bg-amber-600/20 text-amber-300"
              : v.freshness === "missing"
                ? "bg-red-600/20 text-red-300"
                : "bg-zinc-800 text-zinc-500"
        }`}
        title={`Telemetry ${v.freshness}${v.freshness === "unseen" ? "" : ` · ${v.age_ms.toFixed(0)} ms old`}`}
      >
        {v.freshness === "unseen" ? "NO DATA" : v.freshness.toUpperCase()}
      </span>

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
