import { useTeleop } from "../stores/teleop";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Activity,
  Bot,
  RefreshCw,
  Square,
  OctagonAlert,
  ArrowRight,
  Lock,
  ShieldCheck,
} from "lucide-react";

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

  const isRemote = intent.operation_mode === "REMOTE";
  const locked = !intent.engage || !isRemote;
  const live = connected && streamQuality === "live" && v.freshness === "live";

  // Authoritative flags come from the backend (computed from /vehicle/status/
  // control_mode feedback), not from string sniffing here.
  const m = telemetry.mode;
  const conflict = m.autoware_conflict;
  const warning = m.autoware_warning;
  const autoConfirmed = m.autoware_auto_confirmed;

  // READY gate: only green when in REMOTE mode, fully live, control engaged, no estop.
  const ready = connected && isRemote && !locked && live && !estopArmed;
  
  const reasons: string[] = [];
  if (!connected) reasons.push("Not connected to vehicle");
  if (!telemetry.ros2.ok) reasons.push("ROS2 graph not detected");
  if (estopArmed) reasons.push("Emergency stop armed");
  if (conflict) reasons.push("Autoware is driving (AUTO) while REMOTE is engaged — conflict");
  if (!isRemote) reasons.push(`Mode is ${intent.operation_mode} — drive controls inactive`);
  else if (locked) reasons.push("Control locked — press ENGAGE to drive");
  if (connected && streamQuality !== "live") reasons.push("Stream quality degraded");
  if (connected && v.freshness === "unseen") reasons.push("No telemetry received yet");
  if (connected && v.freshness === "missing") reasons.push("Telemetry stream missing");
  const readyReason = reasons.length ? reasons.join(" · ") : "System OK and Ready";

  // Gated TX state: reflect the specific operation mode
  const fullAwait = intent.operation_mode === "FULL" && m.actual_vehicle_mode !== "AUTONOMOUS" && m.actual_vehicle_mode !== "UNKNOWN";
  const txState = estopArmed
    ? { label: "ESTOP", cls: "bg-red-600 text-white animate-pulse" }
    : intent.operation_mode === "STOP"
      ? { label: "STOPPED", cls: "bg-zinc-800 text-zinc-400 border border-zinc-700" }
      : intent.operation_mode === "FULL"
        ? fullAwait
          ? { label: `AWAITING AUTO (${m.actual_vehicle_mode})`, cls: "bg-amber-600/40 text-amber-200 border border-amber-500/60" }
          : { label: "AUTONOMOUS (FULL)", cls: "bg-indigo-600 text-white shadow-sm" }
        : intent.operation_mode === "SIM"
          ? { label: "SIMULATION (VIEW)", cls: "bg-cyan-600 text-white shadow-sm" }
          : locked
            ? { label: "REMOTE (LOCKED)", cls: "bg-zinc-800 text-zinc-400 border border-zinc-700" }
            : !connected || !live
              ? { label: "ARMED (OFFLINE)", cls: "bg-amber-600/30 text-amber-300 border border-amber-500/50" }
              : telemetry.simulated
                ? { label: "REMOTE (SIM ARMED)", cls: "bg-blue-600 text-white" }
                : { label: "REMOTE (ARMED LIVE)", cls: "bg-emerald-600 text-white shadow-sm shadow-emerald-500/30" };

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
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            ready
              ? "bg-emerald-600 text-white ring-1 ring-emerald-400 shadow-sm shadow-emerald-500/20"
              : "bg-zinc-800 text-zinc-300 border border-zinc-700"
          }`}
          title={ready ? "Ready to drive" : readyReason}
          role="status"
        >
          {ready ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-white" />
          ) : (
            <Circle className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
          )}
          <span>{ready ? "READY" : "NOT READY"}</span>
        </span>

        <span
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${txState.cls}`}
          title={`Actuation state: ${txState.label}`}
        >
          {estopArmed ? (
            <OctagonAlert className="w-3.5 h-3.5 shrink-0" />
          ) : intent.operation_mode === "FULL" ? (
            <Bot className="w-3.5 h-3.5 shrink-0" />
          ) : intent.operation_mode === "SIM" ? (
            <Activity className="w-3.5 h-3.5 shrink-0" />
          ) : intent.operation_mode === "STOP" ? (
            <Square className="w-3 h-3 fill-current shrink-0" />
          ) : locked ? (
            <Lock className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{txState.label}</span>
        </span>

        {/* ROS2 graph detection: does the ROS2 environment the web bridge talks
            to actually have the Autoware control/status topics? */}
        {(() => {
          const r = telemetry.ros2;
          if (!connected || !r.ok) {
            return (
              <span
                className="flex items-center gap-1 rounded-lg bg-zinc-800/60 border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-500"
                title="No ROS2 graph detected. Start ros2 + the vehicle bridge so this tool can reach the Autoware topics."
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                ROS2: down
              </span>
            );
          }
          if (!r.autoware_present) {
            return (
              <span
                className="flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/60 px-2.5 py-1.5 text-xs font-semibold text-amber-300"
                title="ROS2 graph is up but the Autoware vehicle-interface topics are not present. Start the Autoware/vehicle stack."
              >
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                ROS2 OK · Autoware absent
              </span>
            );
          }
          return (
            <span
              className="flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/60 px-2.5 py-1.5 text-xs font-semibold text-emerald-300"
              title="ROS2 graph is up and the Autoware control + vehicle-status topics are present."
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ROS2 · Autoware up
            </span>
          );
        })()}

        <span
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-zinc-700 bg-zinc-800/60 text-zinc-300"
          title={`Requested mode: ${intent.operation_mode} · Vehicle actual: ${m.actual_vehicle_mode} (from /vehicle/status/control_mode)`}
        >
          <span>{intent.operation_mode}</span>
          <ArrowRight className="w-3 h-3 text-zinc-500" />
          <span>{m.actual_vehicle_mode}</span>
        </span>

        {conflict && (
          <span
            className="rounded-lg bg-red-500/20 border border-red-500/60 px-3 py-1.5 text-xs font-bold text-red-300 animate-pulse flex items-center gap-1.5"
            title="CONFLICT: vehicle reports AUTONOMOUS while REMOTE is engaged — two drive authorities are fighting over /control/command/*"
            role="alert"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>TOPIC CONFLICT</span>
          </span>
        )}

        {warning && (
          <span
            className="rounded-lg bg-amber-500/20 border border-amber-500/60 px-3 py-1.5 text-xs font-bold text-amber-300 flex items-center gap-1.5"
            title="Autoware Universe is driving (AUTO). ENGAGING REMOTE would conflict with it."
          >
            <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>AUTOWARE DRIVING</span>
          </span>
        )}

        {autoConfirmed && (
          <span
            className="rounded-lg bg-emerald-500/20 border border-emerald-500/60 px-3 py-1.5 text-xs font-bold text-emerald-300 flex items-center gap-1.5"
            title="Vehicle confirmed AUTONOMOUS — Autoware Universe is in control. Viewing only."
          >
            <Bot className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>AUTOWARE AUTO</span>
          </span>
        )}

        {!connected && (
          <span
            className="rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300 animate-pulse flex items-center gap-1.5"
            title="Reconnecting to backend"
          >
            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
            <span>RECONNECTING{reconnectAttempts > 0 ? ` (${reconnectAttempts})` : ""}</span>
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
          className="min-h-[38px] flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-zinc-950 transition hover:bg-amber-400 active:scale-95 shadow-sm"
        >
          <Square className="w-3.5 h-3.5 fill-current shrink-0" />
          <span>Stop / Release</span>
        </button>

        {estopArmed ? (
          <button
            onClick={() => setEstop(false)}
            title="Clear emergency stop state"
            className="min-h-[38px] flex items-center gap-1.5 rounded-lg border-2 border-red-500 bg-red-950/80 px-4 py-2 text-xs font-bold text-red-200 transition hover:bg-red-900 active:scale-95 animate-pulse"
          >
            <OctagonAlert className="w-4 h-4 shrink-0 text-red-300" />
            <span>CLEAR ESTOP</span>
          </button>
        ) : (
          <button
            onClick={() => setEstop(true)}
            title="Trigger emergency stop (disarms vehicle and holds brakes)"
            className="min-h-[38px] flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-red-500 active:scale-95 shadow-sm shadow-red-600/40"
          >
            <OctagonAlert className="w-4 h-4 shrink-0 text-white" />
            <span>EMERGENCY STOP</span>
          </button>
        )}
      </div>
    </div>
  );
}

