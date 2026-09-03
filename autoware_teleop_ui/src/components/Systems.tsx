import { useTeleop } from "../stores/teleop";
import { GEAR, MANUAL_MODES, OPERATION_MODES } from "../lib/schemas";
import { Cpu, AlertTriangle, OctagonAlert } from "lucide-react";

const MODE_COLORS: Record<string, string> = {
  STOP: "bg-red-600 text-white shadow-sm font-bold border border-red-500",
  FULL: "bg-indigo-600 text-white shadow-sm font-bold border border-indigo-500",
  SIM: "bg-cyan-600 text-white shadow-sm font-bold border border-cyan-500",
  REMOTE: "bg-emerald-600 text-white shadow-sm font-bold border border-emerald-500",
};

function Segmented<T extends string>({ options, value, onChange, label, disabled }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; label?: string; disabled?: boolean;
}) {
  const active = value;
  return (
    <div className="space-y-1.5">
      {label && <span className="block text-xs font-medium text-zinc-400">{label}</span>}
      <div className={`flex rounded-lg bg-zinc-800 p-1 border border-zinc-700/60 ${disabled ? "opacity-50" : ""}`}>
        {options.map((o) => {
          const isActive = o === active;
          const activeStyle = MODE_COLORS[o] || "bg-blue-600 text-white shadow-sm font-bold";
          const style = disabled
            ? isActive
              ? "bg-zinc-700 text-zinc-200 border border-zinc-600"
              : "text-zinc-500"
            : isActive
              ? activeStyle
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50";
          return (
            <button
              key={o}
              disabled={disabled}
              onClick={() => onChange(o)}
              title={o}
              className={`min-h-[36px] flex-1 min-w-0 rounded-md px-1 py-1.5 text-[11px] sm:text-xs font-semibold truncate transition ${
                disabled ? "cursor-not-allowed" : ""
              } ${style}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick, disabled }: {
  label: string; on: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[36px] w-full flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-sm ${
        disabled ? "opacity-40 cursor-not-allowed" : "hover:border-zinc-500"
      } ${
        on
          ? "bg-amber-500/20 text-amber-300 border-2 border-amber-500 ring-2 ring-amber-500/20 animate-pulse"
          : "bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-750"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>{label}</span>
      </span>
      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${on ? "bg-amber-400 shadow-sm shadow-amber-400/80" : "bg-zinc-600"}`} />
    </button>
  );
}

const GEAR_META: Record<string, { full: string; color: string; activeColor: string }> = {
  PARK: { full: "Park", color: "border-zinc-700 text-zinc-300 hover:bg-zinc-800", activeColor: "bg-zinc-700 text-white border-zinc-500 ring-2 ring-zinc-400" },
  DRIVE: { full: "Drive", color: "border-blue-800/60 bg-blue-950/20 text-blue-300 hover:bg-blue-900/40", activeColor: "bg-blue-600 text-white border-blue-400 ring-2 ring-blue-400 shadow-md" },
  REVERSE: { full: "Reverse", color: "border-rose-800/60 bg-rose-950/20 text-rose-300 hover:bg-rose-900/40", activeColor: "bg-rose-600 text-white border-rose-400 ring-2 ring-rose-400 shadow-md" },
  NEUTRAL: { full: "Neutral", color: "border-emerald-800/60 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-900/40", activeColor: "bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400 shadow-md" },
};

export function Systems() {
  const intent = useTeleop((s) => s.intent);
  const setGear = useTeleop((s) => s.setGear);
  const setTurn = useTeleop((s) => s.setTurn);
  const toggleHazard = useTeleop((s) => s.toggleHazard);
  const setOperationMode = useTeleop((s) => s.setOperationMode);
  const setManualMode = useTeleop((s) => s.setManualMode);
  const setEstop = useTeleop((s) => s.setEstop);
  const estopArmed = useTeleop((s) => s.estopArmed);

  const locked = !intent.engage;
  const isRemote = intent.operation_mode === "REMOTE";
  const driveLocked = locked || !isRemote;

  const MODE_EXPLANATIONS: Record<string, string> = {
    STOP: "Vehicle stopped. Drive control inactive.",
    FULL: "Autonomous mode · Autoware Universe controlling vehicle · Viewing only",
    SIM: "Simulation mode · No hardware sensors · Viewing only",
    REMOTE: "Remote teleoperation · Drive control active when engaged",
  };

  return (
    <div className="relative flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4 shadow-md">
      <div className="space-y-4">
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-500 shrink-0" />
          Vehicle Systems
        </h2>

        <div className="space-y-2">
          <Segmented options={OPERATION_MODES} value={intent.operation_mode}
            onChange={setOperationMode} label="Operation Mode" />
          <div className="text-[11px] font-medium text-zinc-400 bg-zinc-950/60 px-2.5 py-1 rounded-md border border-zinc-800/80">
            {MODE_EXPLANATIONS[intent.operation_mode]}
          </div>
          <Segmented options={MANUAL_MODES} value={intent.manual_control_mode}
            onChange={setManualMode} label="Control Mode" disabled={driveLocked} />
        </div>

        {/* Transmission Gear Selector */}
        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">Transmission Gear</span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400 border border-zinc-700"
              title="Gear buttons set the REQUESTED gear; the confirmed vehicle gear is shown in the dashboard.">
              REQUESTED GEAR
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {GEAR.map((g) => {
              const isActive = intent.gear === g;
              const meta = GEAR_META[g];
              let btnClass: string;

              if (driveLocked) {
                btnClass = isActive
                  ? "bg-zinc-800 text-zinc-300 border-2 border-zinc-600"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800";
              } else if (isActive) {
                btnClass = meta.activeColor;
              } else {
                btnClass = `border ${meta.color} bg-zinc-900/60`;
              }

              return (
                <button
                  key={g}
                  onClick={() => setGear(g)}
                  disabled={driveLocked}
                  title={!isRemote ? "Gear control disabled in non-REMOTE mode" : `${g} — ${meta.full}${isActive ? " (Requested)" : ""}`}
                  className={`min-h-[44px] flex flex-col items-center justify-center rounded-lg p-1 transition active:scale-95 min-w-0 ${
                    driveLocked ? "cursor-not-allowed opacity-50" : ""
                  } ${btnClass}`}
                >
                  <span className="font-mono text-base font-bold leading-none">{g[0]}</span>
                  <span className="text-[10px] font-medium tracking-tight opacity-90 truncate">{meta.full}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lighting & Indicators */}
        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <span className="block text-xs font-semibold text-zinc-300">Lighting & Indicators</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Segmented
                options={["NONE", "LEFT", "RIGHT"] as const}
                value={intent.turn_indicator}
                onChange={setTurn}
                label="Turn Signals"
                disabled={locked}
              />
            </div>
            <div className="flex flex-col justify-end">
              <Toggle label="Hazard" on={intent.hazard} onClick={toggleHazard} disabled={locked} />
            </div>
          </div>
        </div>
      </div>

      {/* Safety Emergency Action Bar */}
      <div className="border-t border-zinc-800 pt-3">
        {estopArmed ? (
          <button
            onClick={() => setEstop(false)}
            className="min-h-[42px] flex items-center justify-center gap-2 w-full rounded-lg border-2 border-red-500 bg-red-950/80 px-4 py-2 text-sm font-bold text-red-200 transition hover:bg-red-900 active:scale-95 animate-pulse shadow-md"
            title="Clear emergency stop state"
          >
            <OctagonAlert className="w-4 h-4 shrink-0 text-red-300" />
            <span>CLEAR EMERGENCY STOP (ARMED)</span>
          </button>
        ) : (
          <button
            onClick={() => setEstop(true)}
            className="min-h-[42px] flex items-center justify-center gap-2 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500 active:scale-95 shadow-md shadow-red-600/30"
            title="Arm vehicle emergency stop"
          >
            <OctagonAlert className="w-4 h-4 shrink-0 text-white" />
            <span>EMERGENCY STOP (ESTOP)</span>
          </button>
        )}
      </div>
    </div>
  );
}

