import { useTeleop, streamIsStale } from "../stores/teleop";
import { Activity, ArrowRight, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";

const fmt = (v: number, d: number) =>
  Number.isFinite(v) ? v.toFixed(d) : "—";/** Semicircular SVG Speedometer Arc */
function SpeedometerGauge({ speed, maxSpeed, dim }: { speed: number; maxSpeed: number; dim?: boolean }) {
  const safeMax = maxSpeed > 0 ? maxSpeed : 3.0;
  const clampedSpeed = Math.max(0, Math.min(safeMax, speed || 0));
  const ratio = clampedSpeed / safeMax;
  
  // Semicircle arc parameters (radius 38, center 50, 48)
  const radius = 38;
  const cx = 50;
  const cy = 48;
  const strokeWidth = 6;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ratio);

  return (
    <div className={`relative flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 p-1.5 sm:p-2 text-center transition min-w-0 ${dim ? "opacity-50" : ""}`}>
      <span className="text-[10px] sm:text-[11px] font-semibold text-zinc-400 truncate w-full">Velocity</span>
      <div className="relative my-0.5 h-14 sm:h-16 w-full max-w-[90px] sm:max-w-[110px]">
        <svg viewBox="0 0 100 58" className="h-full w-full overflow-visible">
          {/* Background track */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="#27272a"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Live speed arc */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="url(#speed-gradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-150"
          />
          <defs>
            <linearGradient id="speed-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="60%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="font-mono text-base sm:text-xl font-bold text-white tracking-tight leading-none">
            {Number.isFinite(speed) ? speed.toFixed(1) : "—"}
          </div>
          <div className="text-[9px] sm:text-[10px] font-medium text-zinc-400">m/s</div>
        </div>
      </div>
      <div className="flex w-full justify-between px-1 sm:px-2 text-[9px] sm:text-[10px] font-mono text-zinc-500">
        <span>0</span>
        <span>{(safeMax / 2).toFixed(1)}</span>
        <span>{safeMax.toFixed(1)}</span>
      </div>
    </div>
  );
}

/** Center-Zero Bidirectional Steering Angle Gauge */
function SteeringGauge({ angle, maxAngle, dim }: { angle: number; maxAngle: number; dim?: boolean }) {
  const safeMax = maxAngle > 0 ? maxAngle : 0.747;
  const clamped = Math.max(-safeMax, Math.min(safeMax, angle || 0));
  // Needle angle: -60 deg (left) to +60 deg (right)
  const deg = (clamped / safeMax) * 60;
  const degreesVal = ((clamped * 180) / Math.PI).toFixed(0);

  return (
    <div className={`relative flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 p-1.5 sm:p-2 text-center transition min-w-0 ${dim ? "opacity-50" : ""}`}>
      <span className="text-[10px] sm:text-[11px] font-semibold text-zinc-400 truncate w-full">Steer Angle</span>
      <div className="relative my-0.5 h-14 sm:h-16 w-full max-w-[90px] sm:max-w-[110px] flex items-center justify-center">
        <svg viewBox="0 0 100 58" className="h-full w-full overflow-visible">
          {/* Background center-zero arc */}
          <path
            d="M 16 48 A 38 38 0 0 1 84 48"
            fill="none"
            stroke="#27272a"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* Center zero tick */}
          <line x1="50" y1="10" x2="50" y2="18" stroke="#71717a" strokeWidth="2" />
          {/* Dynamic Needle */}
          <g transform={`rotate(${deg} 50 48)`} className="transition-transform duration-150">
            <line x1="50" y1="48" x2="50" y2="14" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
            <circle cx="50" cy="48" r="4" fill="#38bdf8" />
          </g>
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="font-mono text-xs sm:text-base font-bold text-white tracking-tight leading-none">
            {Number.isFinite(angle) ? `${angle.toFixed(2)} rad` : "—"}
          </div>
          <div className="text-[9px] sm:text-[10px] font-medium text-zinc-400 truncate w-full">
            {Number.isFinite(angle) ? `${degreesVal}° ${angle < -0.02 ? "LEFT" : angle > 0.02 ? "RIGHT" : "CENTER"}` : "—"}
          </div>
        </div>
      </div>
      <div className="flex w-full justify-between px-1 sm:px-2 text-[9px] sm:text-[10px] font-mono text-zinc-500">
        <span>-L</span>
        <span>0</span>
        <span>+R</span>
      </div>
    </div>
  );
}

function GearTile({ gear, dim }: { gear: string; dim?: boolean }) {
  const isD = gear === "DRIVE";
  const isR = gear === "REVERSE";
  const isP = gear === "PARK";
  const isN = gear === "NEUTRAL";

  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 p-1.5 sm:p-2 text-center transition min-w-0 ${dim ? "opacity-50" : ""}`}>
      <span className="text-[10px] sm:text-[11px] font-semibold text-zinc-400 truncate w-full">Vehicle Gear</span>
      <div className="my-auto flex flex-col items-center justify-center py-1">
        <span
          className={`font-mono text-xl sm:text-2xl font-black transition ${
            isD
              ? "text-blue-400"
              : isR
                ? "text-rose-400"
                : isN
                  ? "text-emerald-400"
                  : isP
                    ? "text-amber-400"
                    : "text-zinc-200"
          }`}
        >
          {gear || "—"}
        </span>
        <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400">CONFIRMED</span>
      </div>
    </div>
  );
}

function Lamp({ label, on, color }: { label: string; on: boolean; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-800/80 px-1.5 sm:px-2 py-1 text-xs font-semibold border border-zinc-750 min-w-0">
      <span className="text-zinc-300 truncate text-[10px] sm:text-xs">{label}</span>
      <span className={`rounded px-1 py-0.2 text-[9px] sm:text-[10px] font-bold transition shrink-0 ${on ? `${color} shadow-sm` : "bg-zinc-900 text-zinc-500"}`}>
        {on ? "ON" : "OFF"}
      </span>
    </div>
  );
}


export function Dashboard() {
  const telemetry = useTeleop((s) => s.telemetry);
  const connected = useTeleop((s) => s.connected);
  const estopArmed = useTeleop((s) => s.estopArmed);
  const intent = useTeleop((s) => s.intent);
  const streamQuality = useTeleop((s) => s.streamQuality);
  const v = telemetry.vehicle;
  const wd = telemetry.watchdog_tripped;
  const req = telemetry.requested;

  const stale = streamIsStale(streamQuality) || v.freshness === "unseen" || v.freshness === "missing";
  const dim = stale;
  const unseen = v.freshness === "unseen";

  const dispSpeed = unseen ? 0 : v.velocity;
  const dispSteer = unseen ? 0 : v.steer_angle;
  const dispCmdSpeed = unseen ? "—" : fmt(req.speed, 1);
  const dispActSpeed = unseen ? "—" : fmt(v.velocity, 1);
  const dispCmdSteer = unseen ? "—" : fmt(req.steer, 2);
  const dispActSteer = unseen ? "—" : fmt(v.steer_angle, 2);

  const speedDiff = unseen ? null : v.velocity - req.speed;
  const steerDiff = unseen ? null : v.steer_angle - req.steer;

  const ageTxt = unseen ? "—" : `${v.age_ms.toFixed(0)} ms`;
  const freshTone =
    v.freshness === "live"
      ? "text-emerald-400 bg-emerald-950/40 border-emerald-800"
      : v.freshness === "late"
        ? "text-amber-400 bg-amber-950/40 border-amber-800"
        : v.freshness === "missing"
          ? "text-rose-400 bg-rose-950/40 border-rose-800"
          : "text-zinc-500 bg-zinc-800 border-zinc-700";

  return (
    <div className="relative flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4 shadow-md">
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500 shrink-0" />
            Telemetry & Feedback
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500 shadow-sm shadow-emerald-500/80" : "bg-red-500 animate-ping"}`} />
            <span className={`font-semibold ${connected ? "text-emerald-400" : "text-rose-400"}`}>
              {connected ? "Connected" : "Disconnected"}
            </span>
            {telemetry.simulated && (
              <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm" title="Simulation Reports">
                SIM
              </span>
            )}
            {estopArmed && <span className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white animate-pulse">ESTOP</span>}
            {wd && <span className="rounded-md bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white">DEADMAN</span>}
          </div>
        </div>

        {/* Graphical Instrument Cluster */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
          <SpeedometerGauge speed={dispSpeed} maxSpeed={intent.bridge_params.max_speed_forward} dim={dim} />
          <SteeringGauge angle={dispSteer} maxAngle={intent.bridge_params.max_steering_angle} dim={dim} />
          <GearTile gear={unseen ? "—" : v.gear} dim={dim} />
        </div>

        {/* Visual Command vs Feedback Tracking */}
        <div className={`rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2.5 transition ${dim ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-xs font-bold text-zinc-300">Command vs Vehicle Feedback</span>
            <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${freshTone}`}>
              TLM {v.freshness} · {ageTxt}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex flex-wrap items-center justify-between gap-1 border-b border-zinc-850 pb-1.5">
              <span className="text-zinc-400 font-sans text-[11px] sm:text-xs">Speed Tracking:</span>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-zinc-400">Cmd <strong className="text-blue-400 font-mono">{dispCmdSpeed}</strong></span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-400">Act <strong className="text-emerald-400 font-mono">{dispActSpeed}</strong> m/s</span>
                {speedDiff !== null && (
                  <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${Math.abs(speedDiff) > 0.2 ? "bg-amber-500/20 text-amber-300" : "text-zinc-500"}`}>
                    Δ {speedDiff >= 0 ? "+" : ""}{speedDiff.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1 border-b border-zinc-850 pb-1.5">
              <span className="text-zinc-400 font-sans text-[11px] sm:text-xs">Steering Tracking:</span>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-zinc-400">Cmd <strong className="text-blue-400 font-mono">{dispCmdSteer}</strong></span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-400">Act <strong className="text-emerald-400 font-mono">{dispActSteer}</strong> rad</span>
                {steerDiff !== null && (
                  <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${Math.abs(steerDiff) > 0.05 ? "bg-amber-500/20 text-amber-300" : "text-zinc-500"}`}>
                    Δ {steerDiff >= 0 ? "+" : ""}{steerDiff.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-zinc-400 font-sans text-[11px] sm:text-xs">Gear Match:</span>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-zinc-400">Req <strong className="text-blue-400">{req.gear}</strong></span>
                <ArrowRight className="w-3 h-3 text-zinc-600" />
                <span className="text-zinc-400">Act <strong className="text-emerald-400">{v.gear}</strong></span>
                <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${req.gear === v.gear ? "text-emerald-400" : "bg-amber-500/20 text-amber-300 animate-pulse"}`}>
                  {req.gear === v.gear ? "MATCHED" : "SHIFTING"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Lighting and Lamp Signals */}
        <div className={`grid grid-cols-3 gap-1.5 sm:gap-2 transition ${dim ? "opacity-60" : ""}`}>
          <Lamp label="Left" on={v.turn_indicator === "LEFT" || v.hazard} color="bg-amber-500 text-zinc-950 ring-1 ring-amber-400" />
          <Lamp label="Right" on={v.turn_indicator === "RIGHT" || v.hazard} color="bg-amber-500 text-zinc-950 ring-1 ring-amber-400" />
          <Lamp label="Hazard" on={v.hazard} color="bg-rose-600 text-white ring-1 ring-rose-400 animate-pulse" />
        </div>


        {/* Operational Modes Matrix */}
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300">
          <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800">
            <div className="text-[11px] font-medium text-zinc-400">Operation Mode (requested)</div>
            <div className="font-mono text-sm font-bold text-white mt-0.5">{telemetry.mode.operation_mode}</div>
          </div>
          <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800">
            <div className="text-[11px] font-medium text-zinc-400">Vehicle Actual</div>
            <div className="font-mono text-sm font-bold text-white mt-0.5">{telemetry.mode.actual_vehicle_mode}</div>
          </div>
          <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800">
            <div className="text-[11px] font-medium text-zinc-400">Manual Mode</div>
            <div className="font-mono text-sm font-bold text-white mt-0.5">{telemetry.mode.manual_control_mode}</div>
          </div>
          <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800">
            <div className="text-[11px] font-medium text-zinc-400">Drive Mode</div>
            <div className="font-mono text-sm font-bold text-white mt-0.5">{telemetry.mode.drive_mode}</div>
          </div>
        </div>

        {telemetry.mode.autoware_conflict && (
          <div className="rounded-lg border border-red-600/80 bg-red-950/40 p-2.5 text-xs text-red-300 flex items-center gap-2" role="alert">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-semibold">CONFLICT: Autoware is driving (AUTO) while REMOTE is engaged</span>
          </div>
        )}
        {!telemetry.mode.autoware_conflict && telemetry.mode.autoware_warning && (
          <div className="rounded-lg border border-amber-600/80 bg-amber-950/40 p-2.5 text-xs text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold">Autoware is driving — engaging REMOTE would conflict</span>
          </div>
        )}
        {!telemetry.mode.autoware_conflict && telemetry.mode.autoware_auto_confirmed && (
          <div className="rounded-lg border border-emerald-700/80 bg-emerald-950/40 p-2.5 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">Autoware AUTO confirmed — viewing only</span>
          </div>
        )}

        {telemetry.info && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-2.5 text-xs text-amber-300">
            {telemetry.info}
          </div>
        )}
      </div>
    </div>
  );
}

