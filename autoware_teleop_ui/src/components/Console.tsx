import { useTeleop } from "../stores/teleop";
import { INPUT_MODES } from "../lib/schemas";
import { useEffect, useRef, useState } from "react";

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
    <div className="text-[11px] text-zinc-400">
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 truncate" title={`${label}${hint ? ` (${hint})` : ""}`}>{label}</span>
        <input type="range" min={min} max={max} step={step} value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 min-w-0 flex-1 appearance-none rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: `linear-gradient(to right, ${accent ?? "#3b82f6"} ${pct}%, #27272a ${pct}%)` }} />
        <input type="number" min={min} max={max} step={step} value={editing ? draft : String(value)}
          disabled={disabled}
          onFocus={() => { setDraft(String(value)); setEditing(true); }}
          onChange={(e) => { draftRef.current = e.target.value; setDraft(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
          onBlur={commit}
          className="w-14 shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-right font-mono text-[11px] text-zinc-100 disabled:opacity-40"
          title={`${min} … ${max}`} />
      </div>
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange, label }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-24 shrink-0 text-[11px] text-zinc-500">{label}</span>}
      <div className="flex flex-1 rounded-md bg-zinc-800 p-0.5">
        {options.map((o) => (
          <button key={o}
            onClick={() => onChange(o)}
            className={`flex-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition
              ${value === o ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
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
    <div className="border-t border-zinc-800 pt-2">
      <div className="flex flex-wrap gap-1">
        {defs.map(([label, active, hint]) => (
          <kbd
            key={label}
            title={hint}
            className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold transition ${
              active
                ? "bg-blue-600 text-white ring-1 ring-blue-400"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {label}
          </kbd>
        ))}
      </div>
      <p className="mt-1 text-[10px] leading-tight text-zinc-600">
        Hold to move — <span className="text-zinc-400">W/S</span> throttle ·{" "}
        <span className="text-zinc-400">A/D</span> steer · <span className="text-zinc-400">Space</span>{" "}
        brake
      </p>
    </div>
  );
}

export function Console() {
  const intent = useTeleop((s) => s.intent);
  const setIntent = useTeleop((s) => s.setIntent);
  const toggleEngage = useTeleop((s) => s.toggleEngage);
  const setInputMode = useTeleop((s) => s.setInputMode);
  const setLimit = useTeleop((s) => s.setLimit);
  const streamQuality = useTeleop((s) => s.streamQuality);
  const keys = useTeleop((s) => s.keys);
  const bp = intent.bridge_params;
  const isKeyboard = intent.input_mode === "keyboard";
  const locked = !intent.engage;

  const qLabel =
    streamQuality === "live"
      ? "LIVE"
      : streamQuality === "delayed"
        ? "DELAYED"
        : streamQuality === "lost"
          ? "LOST"
          : "CONNECTING";

  return (
    <div className="relative rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Drive</h2>
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              streamQuality === "live"
                ? "bg-green-600 text-white"
                : streamQuality === "delayed"
                  ? "bg-amber-600 text-white"
                  : "bg-red-600 text-white"
            }`}
          >
            {qLabel}
          </span>
          <span className="text-xs text-zinc-500">10 Hz</span>
        </div>
      </div>

      <Segmented options={INPUT_MODES} value={intent.input_mode}
        onChange={setInputMode} label="Input" />
      {isKeyboard && <Keycaps keys={keys} />}

      <button onClick={toggleEngage}
        className={`w-full rounded-md px-2 py-1 text-xs font-bold transition
          ${intent.engage ? "bg-green-600 text-white" : "bg-zinc-800 text-green-400 hover:bg-zinc-700"}`}>
        {intent.engage ? "ENGAGED" : "ENGAGE"}
      </button>

      <div className="relative">
        {/* Drive axes + limits, covered by overlay when locked/keyboard */}
        <div className="space-y-1.5">
          <div className="border-t border-zinc-800 pt-2">
            <AxisSlider label="Throttle" value={intent.throttle} min={-1} max={1} step={0.01}
              onChange={(v) => setIntent({ throttle: v })} accent="#22c55e" disabled={isKeyboard || locked} />
            <AxisSlider label="Brake" value={intent.brake} min={0} max={1} step={0.01}
              onChange={(v) => setIntent({ brake: v })} accent="#ef4444" disabled={isKeyboard || locked} />
            <AxisSlider label="Steering" value={intent.steer} min={-1} max={1} step={0.01}
              onChange={(v) => setIntent({ steer: v })} accent="#3b82f6" disabled={isKeyboard || locked} />
          </div>

          <div className="border-t border-zinc-800 pt-2">
            <span className="mb-1 block text-[11px] text-zinc-500">Authority limits (node-clamped)</span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              <AxisSlider label="Fwd m/s" value={bp.max_speed_forward} min={0} max={3} step={0.05}
                onChange={(v) => setLimit({ max_speed_forward: v })} accent="#22c55e" hint="0–3 m/s" />
              <AxisSlider label="Rev m/s" value={bp.max_speed_reverse} min={0} max={0.5} step={0.05}
                onChange={(v) => setLimit({ max_speed_reverse: v })} accent="#ef4444" hint="0–0.5 m/s" />
              <AxisSlider label="Steer rad" value={bp.max_steering_angle} min={0} max={0.747} step={0.01}
                onChange={(v) => setLimit({ max_steering_angle: v })} accent="#3b82f6" hint="0–0.747 rad" />
              <AxisSlider label="Brk m/s²" value={bp.max_deceleration} min={0} max={5} step={0.1}
                onChange={(v) => setLimit({ max_deceleration: v })} accent="#f59e0b" hint="0–5 m/s²" />
            </div>
          </div>
        </div>

        {(locked || isKeyboard) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl
            bg-zinc-950/70 backdrop-blur-sm">
            <div className="text-center">
              <div className="text-lg font-bold tracking-widest text-white">
                {locked ? "LOCKED" : "KEYBOARD MODE"}
              </div>
              {locked && <div className="mt-1 text-xs text-zinc-400">Press ENGAGE to unlock</div>}
              {isKeyboard && !locked && <div className="mt-1 text-xs text-zinc-400">WASD + Space to drive</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
