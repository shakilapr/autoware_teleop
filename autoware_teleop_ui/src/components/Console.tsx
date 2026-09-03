import { useTeleop } from "../stores/teleop";
import { INPUT_MODES } from "../lib/schemas";
import { useEffect, useRef, useState } from "react";
import { Zap, Check, Lock, AlertTriangle, Sliders, ShieldCheck } from "lucide-react";

function AxisSlider({ label, value, min, max, step, onChange, accent, disabled, hint }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; accent?: string; disabled?: boolean; hint?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  // Numeric draft commits only on Enter/blur to avoid noisy transient intents
  // while typing (e.g. "0." → "0.7").
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const draftRef = useRef(String(value));
  useEffect(() => { if (!editing) setDraft(String(value)); }, [editing, value]);

  const commit = () => {
    const n = Number(draftRef.current);
    if (draftRef.current !== "" && Number.isFinite(n)) {
      onChange(Math.min(max, Math.max(min, n)));
    }
    setDraft(String(value));
    setEditing(false);
  };

  return (
    <div className="text-xs text-zinc-300">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <span className="w-18 sm:w-20 shrink-0 font-medium truncate text-[11px] sm:text-xs" title={`${label}${hint ? ` (${hint})` : ""}`}>
          {label}
        </span>
        <div className="relative flex-1 min-w-0 flex items-center">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-2 w-full appearance-none rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(to right, ${accent ?? "#3b82f6"} ${pct}%, #27272a ${pct}%)` }}
          />
        </div>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={editing ? draft : String(value)}
          disabled={disabled}
          onFocus={() => { setDraft(String(value)); setEditing(true); }}
          onChange={(e) => { draftRef.current = e.target.value; setDraft(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
          }}
          onBlur={commit}
          className="h-8 w-14 sm:w-16 shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-1.5 text-right font-mono text-[11px] sm:text-xs text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
          title={`${min} … ${max}`}
        />
      </div>
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange, label }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && <span className="block text-xs font-medium text-zinc-400">{label}</span>}
      <div className="flex rounded-lg bg-zinc-800 p-1 border border-zinc-700/60">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            title={o}
            className={`min-h-[34px] flex-1 min-w-0 rounded-md px-2 py-1.5 text-xs font-semibold truncate transition ${
              value === o
                ? "bg-blue-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Read-only command meter for keyboard mode: shows the axis fill + the derived
 * physical command the operator is requesting.
 */
function CommandMeter({ label, axis, accent, physical }: {
  label: string; axis: number; accent: string; physical: string;
}) {
  const bipolar = axis < 0;
  const pct = Math.min(100, Math.abs(axis) * 100);
  const fillStyle = bipolar
    ? { width: `${Math.min(50, pct / 2)}%` }
    : { width: `${pct}%` };
  const trackStyle = bipolar
    ? {
        backgroundImage: `linear-gradient(to right, ${accent} ${pct / 2}%, #3f3f46 ${pct / 2}%)`,
      }
    : undefined;

  return (
    <div className="text-xs text-zinc-300 min-h-[32px] flex items-center">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full">
        <span className="w-18 sm:w-20 shrink-0 font-medium truncate text-[11px] sm:text-xs" title={label}>{label}</span>
        <div className="relative flex-1 min-w-0 flex items-center">
          {bipolar ? (
            <div className="relative h-2 w-full rounded-full bg-zinc-800 border border-zinc-700" style={trackStyle}>
              <div className="absolute left-1/2 top-0 h-full w-0.5 bg-zinc-400" />
              <div
                className={`absolute top-0 h-full rounded-full ${accent.includes("ef4444") ? "bg-red-500" : "bg-emerald-500"}`}
                style={{ left: "50%", ...fillStyle }}
              />
            </div>
          ) : (
            <div className="h-2 w-full rounded-full bg-zinc-800 border border-zinc-700">
              <div
                className={`h-full rounded-full ${accent.includes("ef4444") ? "bg-red-500" : "bg-emerald-500"}`}
                style={fillStyle}
              />
            </div>
          )}
        </div>
        <div className="h-8 w-14 sm:w-16 shrink-0 rounded-md border border-zinc-700 bg-zinc-800/80 px-1.5 flex items-center justify-end font-mono text-[11px] sm:text-xs font-semibold text-zinc-100 truncate" title={physical}>
          {physical}
        </div>
      </div>
    </div>
  );
}

function fmtCmd(v: number, unit: string) {
  const s = v >= 0 ? "" : "-";
  return `${s}${Math.abs(v).toFixed(2)} ${unit}`;
}

function Keycaps({ keys }: { keys: Partial<Record<string, boolean>> }) {
  const defs = [
    ["W", keys["w"], "throttle up"],
    ["S", keys["s"], "throttle down / reverse"],
    ["A", keys["a"], "steer left"],
    ["D", keys["d"], "steer right"],
    ["SPACE", keys["space"], "brake"],
  ] as const;

  return (
    <div className="h-[72px] rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 flex flex-col justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {defs.map(([label, active, hint]) => (
          <kbd
            key={label}
            title={hint}
            className={`h-[24px] flex items-center justify-center rounded-md px-2 font-mono text-[11px] font-bold transition shadow-sm border ${
              active
                ? "bg-blue-600 text-white border-blue-400 shadow-blue-500/50"
                : "bg-zinc-800 text-zinc-300 border-zinc-700"
            }`}
          >
            {label}
          </kbd>
        ))}
      </div>
      <p className="text-[10.5px] leading-none text-zinc-400 truncate">
        Hold keys to drive — <span className="font-semibold text-zinc-200">W/S</span> throttle ·{" "}
        <span className="font-semibold text-zinc-200">A/D</span> steer ·{" "}
        <span className="font-semibold text-zinc-200">Space</span> brake
      </p>
    </div>
  );
}

export function Console() {
  const intent = useTeleop((s) => s.intent);
  const telemetry = useTeleop((s) => s.telemetry);
  const setIntent = useTeleop((s) => s.setIntent);
  const toggleEngage = useTeleop((s) => s.toggleEngage);
  const setInputMode = useTeleop((s) => s.setInputMode);
  const setLimit = useTeleop((s) => s.setLimit);
  const streamQuality = useTeleop((s) => s.streamQuality);
  const keys = useTeleop((s) => s.keys);
  const bp = intent.bridge_params;
  const isKeyboard = intent.input_mode === "keyboard";

  const isRemote = intent.operation_mode === "REMOTE";
  const locked = !intent.engage || !isRemote;

  const autowareConflict = isRemote && (
    Boolean(telemetry.mode.autoware_conflict) ||
    telemetry.mode.drive_mode.toLowerCase() === "autonomous" ||
    telemetry.info.toLowerCase().includes("conflict")
  );

  const qLabel =
    streamQuality === "live"
      ? "LIVE"
      : streamQuality === "delayed"
        ? "DELAYED"
        : streamQuality === "lost"
          ? "LOST"
          : "CONNECTING";

  return (
    <div className="relative flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4 shadow-md">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-500 shrink-0" />
            Drive Control
          </h2>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                streamQuality === "live"
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                  : streamQuality === "delayed"
                    ? "bg-amber-600 text-white"
                    : "bg-red-600 text-white"
              }`}
            >
              {qLabel}
            </span>
            <span className="text-xs font-medium text-zinc-400">10 Hz</span>
          </div>
        </div>

        {/* Stable Status Slot (fixed height to prevent layout shift) */}
        <div className="h-[34px] flex items-center">
          {isRemote ? (
            autowareConflict ? (
              <div className="w-full h-full flex items-center rounded-lg border border-amber-500 bg-amber-950/80 px-2.5 text-amber-200 shadow-md">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-300 truncate">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">TOPIC CONFLICT: Autoware Universe Running</span>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-between rounded-lg bg-zinc-950/60 px-3 border border-zinc-800 text-xs">
                <span className="text-zinc-400 text-[11px] shrink-0">Autoware Status:</span>
                <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1.5 truncate">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Clear · Remote Authority Active</span>
                </span>
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-between rounded-lg bg-zinc-950/40 px-3 border border-zinc-850 text-xs">
              <span className="text-zinc-500 text-[11px] shrink-0">Mode Authority:</span>
              <span className="text-zinc-400 font-medium text-[11px] truncate">
                {intent.operation_mode === "FULL"
                  ? "Autonomous (Passive Monitor)"
                  : intent.operation_mode === "SIM"
                    ? "Simulation (Viewing Only)"
                    : "Vehicle Stopped (Safe Hold)"}
              </span>
            </div>
          )}
        </div>

        <Segmented options={INPUT_MODES} value={intent.input_mode} onChange={setInputMode} label="Input Mode" />

        {/* Stable Input Hint Slot (prevents vertical jump when toggling keyboard/raw) */}
        <div className="h-[72px]">
          {isKeyboard ? (
            <Keycaps keys={keys} />
          ) : (
            <div className="h-[72px] flex flex-col justify-center rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-400">
              <div className="font-semibold text-zinc-300 text-[11px]">Direct Axis Input</div>
              <p className="text-[11px] text-zinc-500 mt-0.5">Control vehicle using the sliders or click-to-edit values below.</p>
            </div>
          )}
        </div>

        <button
          onClick={toggleEngage}
          disabled={!isRemote}
          className={`h-[42px] flex items-center justify-center gap-2 w-full rounded-lg px-3 py-2 text-xs sm:text-sm font-bold tracking-wide transition border ${
            !isRemote
              ? "bg-zinc-800/80 text-zinc-400 border-zinc-700 cursor-not-allowed opacity-70"
              : intent.engage
                ? "bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 hover:bg-emerald-500"
                : "border-emerald-500/70 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-400"
          }`}
        >
          {!isRemote ? (
            <>
              <Lock className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {intent.operation_mode === "FULL"
                  ? "AUTONOMOUS MODE (LOCKED)"
                  : intent.operation_mode === "SIM"
                    ? "SIMULATION MODE (LOCKED)"
                    : "VEHICLE STOPPED (LOCKED)"}
              </span>
            </>
          ) : intent.engage ? (
            <>
              <Check className="w-4 h-4 shrink-0 stroke-[3]" />
              <span className="truncate">ENGAGED (CLICK TO LOCK)</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 shrink-0 fill-current" />
              <span className="truncate">PRESS TO ENGAGE CONTROL</span>
            </>
          )}
        </button>

        <div className="relative rounded-lg p-1">
          {/* LOCKED overlay covers command surface when disengaged or non-remote */}
          {locked && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-zinc-950/85 backdrop-blur-[2px] border border-zinc-800">
              <div className="text-center p-3">
                <div className="text-sm font-bold tracking-widest text-zinc-200">
                  {!isRemote
                    ? intent.operation_mode === "FULL"
                      ? "AUTONOMOUS MONITORING ONLY"
                      : intent.operation_mode === "SIM"
                        ? "SIMULATION VIEWING ONLY"
                        : "VEHICLE STOPPED"
                    : "CONTROL LOCKED"}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {!isRemote
                    ? intent.operation_mode === "FULL"
                      ? "Vehicle is commanded by Autoware Universe. Drive controls are disabled."
                      : intent.operation_mode === "SIM"
                        ? "Autoware simulation is running without real sensors. Drive controls are disabled."
                        : "Vehicle is in STOP mode. Switch to REMOTE mode to drive."
                    : "Press ENGAGE above to enable throttle & steering"}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 pt-1">
            {isKeyboard ? (
              // Keyboard mode: command meters
              <div className="space-y-2.5 rounded-lg bg-zinc-950/40 p-2.5 border border-zinc-800/80">
                <CommandMeter
                  label="Throttle"
                  axis={intent.throttle}
                  accent="#22c55e"
                  physical={`cmd ${fmtCmd(intent.throttle * (intent.throttle < 0 ? bp.max_speed_reverse : bp.max_speed_forward), "m/s")}`}
                />
                <CommandMeter
                  label="Brake"
                  axis={intent.brake}
                  accent="#ef4444"
                  physical={`cmd ${fmtCmd(intent.brake * bp.max_deceleration, "m/s²")}`}
                />
                <CommandMeter
                  label="Steering"
                  axis={intent.steer}
                  accent="#3b82f6"
                  physical={`cmd ${fmtCmd(intent.steer * bp.max_steering_angle, "rad")}`}
                />
              </div>
            ) : (
              // Raw slider mode
              <div className="space-y-2.5 rounded-lg bg-zinc-950/40 p-2.5 border border-zinc-800/80">
                <AxisSlider
                  label="Throttle"
                  value={intent.throttle}
                  min={-1}
                  max={1}
                  step={0.01}
                  onChange={(v) => setIntent({ throttle: v })}
                  accent="#22c55e"
                  disabled={locked}
                />
                <AxisSlider
                  label="Brake"
                  value={intent.brake}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => setIntent({ brake: v })}
                  accent="#ef4444"
                  disabled={locked}
                />
                <AxisSlider
                  label="Steering"
                  value={intent.steer}
                  min={-1}
                  max={1}
                  step={0.01}
                  onChange={(v) => setIntent({ steer: v })}
                  accent="#3b82f6"
                  disabled={locked}
                />
              </div>
            )}

            {/* Authority limits: full-width stacked list to avoid crushing sliders */}
            <div className="border-t border-zinc-800 pt-2.5 space-y-2">
              <span className="block text-xs font-semibold text-zinc-300">
                Authority Limits (Speed & Decel Clamps)
              </span>
              <div className="space-y-2 rounded-lg bg-zinc-950/40 p-2.5 border border-zinc-800/80">
                <AxisSlider
                  label="Fwd Speed"
                  value={bp.max_speed_forward}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(v) => setLimit({ max_speed_forward: v })}
                  accent="#22c55e"
                  hint="0–3 m/s"
                  disabled={locked}
                />
                <AxisSlider
                  label="Rev Speed"
                  value={bp.max_speed_reverse}
                  min={0}
                  max={0.5}
                  step={0.05}
                  onChange={(v) => setLimit({ max_speed_reverse: v })}
                  accent="#ef4444"
                  hint="0–0.5 m/s"
                  disabled={locked}
                />
                <AxisSlider
                  label="Max Steer"
                  value={bp.max_steering_angle}
                  min={0}
                  max={0.747}
                  step={0.01}
                  onChange={(v) => setLimit({ max_steering_angle: v })}
                  accent="#3b82f6"
                  hint="0–0.747 rad"
                  disabled={locked}
                />
                <AxisSlider
                  label="Max Brake"
                  value={bp.max_deceleration}
                  min={0}
                  max={5}
                  step={0.1}
                  onChange={(v) => setLimit({ max_deceleration: v })}
                  accent="#f59e0b"
                  hint="0–5 m/s²"
                  disabled={locked}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

