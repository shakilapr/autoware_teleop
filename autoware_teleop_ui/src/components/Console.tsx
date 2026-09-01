import { useTeleop } from "../stores/teleop";
import { GEAR } from "../lib/schemas";

function AxisSlider({
  label, value, min, max, step, onChange, accent,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; accent?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, ${accent ?? "#3b82f6"} ${pct}%, #27272a ${pct}%)`,
        }}
      />
    </div>
  );
}

export function Console() {
  const intent = useTeleop((s) => s.intent);
  const setIntent = useTeleop((s) => s.setIntent);
  const setGear = useTeleop((s) => s.setGear);
  const toggleEstop = useTeleop((s) => s.toggleEstop);
  const estopArmed = useTeleop((s) => s.estopArmed);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Game Console</h2>
        <span className="text-xs text-zinc-500">10 Hz</span>
      </div>
      <div className="space-y-3">
        <AxisSlider label="Throttle" value={intent.throttle} min={-1} max={1} step={0.01}
          onChange={(v) => setIntent({ throttle: v })} accent="#22c55e" />
        <AxisSlider label="Brake" value={intent.brake} min={0} max={1} step={0.01}
          onChange={(v) => setIntent({ brake: v })} accent="#ef4444" />
        <AxisSlider label="Steering" value={intent.steer} min={-1} max={1} step={0.01}
          onChange={(v) => setIntent({ steer: v })} accent="#3b82f6" />
      </div>
      <div className="mt-4 flex gap-2">
        {GEAR.filter((g) => g !== "NEUTRAL").map((g) => (
          <button key={g}
            onClick={() => setGear(g)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition
              ${intent.gear === g ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
            {g}
          </button>
        ))}
      </div>
      <button
        onClick={toggleEstop}
        className={`mt-3 w-full rounded-md px-3 py-2 text-sm font-bold transition
          ${estopArmed ? "bg-red-600 text-white" : "bg-zinc-800 text-red-400 hover:bg-zinc-700"}`}>
        {estopArmed ? "EMERGENCY STOP (ACTIVE)" : "EMERGENCY STOP"}
      </button>
    </div>
  );
}
