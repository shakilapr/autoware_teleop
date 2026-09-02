import { useTeleop } from "../stores/teleop";
import { GEAR, MANUAL_MODES, OPERATION_MODES } from "../lib/schemas";

function Segmented<T extends string>({ options, value, onChange, label, disabled }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; label?: string; disabled?: boolean;
}) {
  const active = value;
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-24 shrink-0 text-[11px] text-zinc-500">{label}</span>}
      <div className={`flex flex-1 rounded-md bg-zinc-800 p-0.5 ${disabled ? "opacity-60" : ""}`}>
        {options.map((o) => {
          const isActive = o === active;
          // When disabled (locked), the stored selection is NOT commanding — use
          // a muted "stored" style instead of the bright active fill.
          const style = disabled
            ? isActive
              ? "bg-zinc-700 text-zinc-200"
              : "text-zinc-500"
            : isActive
              ? "bg-blue-600 text-white"
              : "text-zinc-400 hover:text-zinc-200";
          return (
            <button key={o}
              disabled={disabled}
              onClick={() => onChange(o)}
              className={`flex-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition
                ${disabled ? "cursor-not-allowed" : ""} ${style}`}>
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
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center justify-between rounded-md px-2 py-1 text-[11px] transition
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${on ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/40" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
      <span>{label}</span>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-400" : "bg-zinc-600"}`} />
    </button>
  );
}

const GEAR_FULL: Record<string, string> = {
  PARK: "Park (safe)",
  DRIVE: "Drive",
  REVERSE: "Reverse",
  NEUTRAL: "Neutral (coast)",
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

  // When locked, only ESTOP remains usable; the rest are disabled so the UI
  // does not imply a state change the node will ignore (node authority).
  const locked = !intent.engage;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-2.5">
      <h2 className="text-sm font-semibold text-zinc-100">Systems</h2>

      <Segmented options={OPERATION_MODES} value={intent.operation_mode}
        onChange={setOperationMode} label="Operation" disabled={locked} />
      <Segmented options={MANUAL_MODES} value={intent.manual_control_mode}
        onChange={setManualMode} label="Manual" disabled={locked} />

      <div className="border-t border-zinc-800 pt-2">
        <span className="mb-1 flex items-center gap-1 text-[11px] text-zinc-500">
          Gear
          <span className="rounded bg-zinc-800 px-1 text-[9px] font-semibold text-zinc-500"
            title="Gear buttons set the REQUESTED gear; the confirmed gear shows in the dashboard.">
            REQ
          </span>
        </span>
        <div className="flex gap-1.5">
          {GEAR.map((g) => {
            const isActive = intent.gear === g;
            const isNeutral = g === "NEUTRAL";
            const isPark = g === "PARK";
            let style: string;
            if (locked) {
              // Node forces NEUTRAL while locked; do not bright-highlight the
              // stored request as if it were commanding.
              style = isActive
                ? "bg-zinc-700 text-zinc-200 border border-zinc-600"
                : "bg-zinc-800 text-zinc-500";
            } else if (isActive) {
              style = isNeutral
                ? "bg-emerald-600 text-white ring-1 ring-emerald-400"
                : isPark
                  ? "bg-zinc-600 text-white"
                  : "bg-blue-600 text-white";
            } else {
              style = isNeutral
                ? "bg-emerald-900/40 text-emerald-300 border border-emerald-800"
                : isPark
                  ? "bg-zinc-800 text-zinc-400"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700";
            }
            return (
              <button key={g} onClick={() => setGear(g)} disabled={locked}
                title={`${g} — ${GEAR_FULL[g] ?? ""}${isActive ? " (requested)" : ""}`}
                className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition
                  ${locked ? "cursor-not-allowed" : ""} ${style}`}>
                {g[0]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <span className="mb-1 block text-[11px] text-zinc-500">Lights</span>
        <div className="flex items-center gap-1.5">
          <Segmented options={["NONE", "LEFT", "RIGHT"] as const} value={intent.turn_indicator}
            onChange={setTurn} label="Turn" disabled={locked} />
          <Toggle label="Hazard" on={intent.hazard} onClick={toggleHazard} disabled={locked} />
        </div>
      </div>

      {estopArmed ? (
        <button onClick={() => setEstop(false)}
          className="w-full rounded-md px-2 py-1.5 text-xs font-bold text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition"
          title="Clear emergency stop">
          CLEAR ESTOP
        </button>
      ) : (
        <button onClick={() => setEstop(true)}
          className="w-full rounded-md px-2 py-1.5 text-xs font-bold bg-red-600 text-white hover:bg-red-500 transition"
          title="Arm emergency stop">
          EMERGENCY STOP
        </button>
      )}
    </div>
  );
}
