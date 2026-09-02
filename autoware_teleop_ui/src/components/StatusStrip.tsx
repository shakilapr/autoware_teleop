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

  // READY gate: only green when fully live and control is engaged without estop.
  const ready = connected && !locked && live && !estopArmed;
  
  const reasons: string[] = [];
  if (!connected) reasons.push("Not connected to vehicle");
  if (estopArmed) reasons.push("Emergency stop armed");
  if (locked) reasons.push("Control locked — press ENGAGE to drive");
  if (connected && streamQuality !== "live") reasons.push("Stream quality degraded");
  if (connected && v.freshness === "unseen") reasons.push("No telemetry received yet");
  if (connected && v.freshness === "missing") reasons.push("Telemetry stream missing");
  const readyReason = reasons.length ? reasons.join(" · ") : "System OK and Ready";

  // Gated TX state: do not show green ARMED if offline or missing telemetry
  const txState = estopArmed
    ? { label: "ESTOP", cls: "bg-red-600 text-white animate-pulse" }
    : locked
      ? { label: "DISARMED", cls: "bg-zinc-800 text-zinc-400 border border-zinc-700" }
      : !connected || !live
        ? { label: "ARMED (OFFLINE)", cls: "bg-amber-600/30 text-amber-300 border border-amber-500/50" }
        : telemetry.simulated
          ? { label: "SIM (ARMED)", cls: "bg-blue-600 text-white" }
          : { label: "ARMED (LIVE)", cls: "bg-emerald-600 text-white shadow-sm shadow-emerald-500/30" };

  const stopAll = () => {
    // Explicit safe release: zero axes + neutral + engage off (node publishes safe frame)
    setIntent({
      throttle: 0,
      brake: 0,
      steer: 0,
      gear: "NEUTRAL",
      engage: false,
    });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 shadow-md">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            ready
              ? "bg-emerald-600 text-white ring-1 ring-emerald-400 shadow-sm shadow-emerald-500/20"
              : "bg-zinc-800 text-zinc-300 border border-zinc-700"
          }`}
          title={ready ? "Ready to drive" : readyReason}
          role="status"
        >
          {ready ? "● READY" : "○ NOT READY"}
        </span>

        <span
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${txState.cls}`}
          title={`Actuation state: ${txState.label}`}
        >
          {txState.label}
        </span>

        {!connected && (
          <span
            className="rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300 animate-pulse"
            title="Reconnecting to backend"
          >
            RECONNECTING{reconnectAttempts > 0 ? ` (${reconnectAttempts})` : ""}
          </span>
        )}

        <span
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border ${
            v.freshness === "live"
              ? "bg-emerald-950/60 border-emerald-800/60 text-emerald-300"
              : v.freshness === "late"
                ? "bg-amber-950/60 border-amber-800/60 text-amber-300"
                : v.freshness === "missing"
                  ? "bg-red-950/60 border-red-800/60 text-red-300"
                  : "bg-zinc-800/60 border-zinc-700 text-zinc-400"
          }`}
          title={`Telemetry freshness: ${v.freshness}${v.freshness === "unseen" ? "" : ` · ${v.age_ms.toFixed(0)} ms latency`}`}
        >
          {v.freshness === "unseen" ? "NO TELEMETRY" : `TLM: ${v.freshness.toUpperCase()}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          onClick={stopAll}
          title="Zero axes + neutral gear + disengage. Safe-release sent to node."
          className="min-h-[38px] rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-zinc-950 transition hover:bg-amber-400 active:scale-95 shadow-sm"
        >
          Stop / Release
        </button>

        {estopArmed ? (
          <button
            onClick={() => setEstop(false)}
            title="Clear emergency stop state"
            className="min-h-[38px] rounded-lg border-2 border-red-500 bg-red-950/80 px-4 py-2 text-xs font-bold text-red-200 transition hover:bg-red-900 active:scale-95 animate-pulse"
          >
            CLEAR ESTOP
          </button>
        ) : (
          <button
            onClick={() => setEstop(true)}
            title="Trigger emergency stop (disarms vehicle and holds brakes)"
            className="min-h-[38px] rounded-lg bg-red-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-red-500 active:scale-95 shadow-sm shadow-red-600/40"
          >
            EMERGENCY STOP
          </button>
        )}
      </div>
    </div>
  );
}

