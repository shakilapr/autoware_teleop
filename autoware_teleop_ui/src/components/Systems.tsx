import { useTeleop } from "../stores/teleop";
import { GEAR, MANUAL_MODES, OPERATION_MODES, TEST_MODES } from "../lib/schemas";
import type { BridgeParams } from "../lib/schemas";

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

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-between rounded-md px-2 py-1 text-[11px] transition
        ${on ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/40" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
      <span>{label}</span>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-400" : "bg-zinc-600"}`} />
    </button>
  );
}

export function Systems() {
  const intent = useTeleop((s) => s.intent);
  const setGear = useTeleop((s) => s.setGear);
  const setTurn = useTeleop((s) => s.setTurn);
  const toggleHazard = useTeleop((s) => s.toggleHazard);
  const setOperationMode = useTeleop((s) => s.setOperationMode);
  const setManualMode = useTeleop((s) => s.setManualMode);
  const setTestMode = useTeleop((s) => s.setTestMode);
  const setBridgeParam = useTeleop((s) => s.setBridgeParam);
  const toggleEstop = useTeleop((s) => s.toggleEstop);
  const estopArmed = useTeleop((s) => s.estopArmed);
  const bp = intent.bridge_params;

  const onBridgeParam = (key: keyof BridgeParams) => (on: boolean) =>
    setBridgeParam({ [key]: on } as Partial<BridgeParams>);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-2.5">
      <h2 className="text-sm font-semibold text-zinc-100">Systems</h2>

      <Segmented options={OPERATION_MODES} value={intent.operation_mode}
        onChange={setOperationMode} label="Operation" />
      <Segmented options={MANUAL_MODES} value={intent.manual_control_mode}
        onChange={setManualMode} label="Manual" />

      <div className="border-t border-zinc-800 pt-2">
        <span className="mb-1 block text-[11px] text-zinc-500">Gear</span>
        <div className="flex gap-1.5">
          {GEAR.map((g) => (
            <button key={g} onClick={() => setGear(g)}
              className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition
                ${intent.gear === g ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
              {g[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <span className="mb-1 block text-[11px] text-zinc-500">Lights</span>
        <div className="flex items-center gap-1.5">
          <Segmented options={["NONE", "LEFT", "RIGHT"] as const} value={intent.turn_indicator}
            onChange={setTurn} label="Turn" />
          <Toggle label="Hazard" on={intent.hazard} onClick={toggleHazard} />
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <span className="mb-1 block text-[11px] text-zinc-500">Test mode</span>
        <Segmented options={TEST_MODES} value={intent.test_mode} onChange={setTestMode} />
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <Toggle label="MTR" on={bp.enable_mtr} onClick={() => onBridgeParam("enable_mtr")(!bp.enable_mtr)} />
          <Toggle label="SES" on={bp.enable_ses} onClick={() => onBridgeParam("enable_ses")(!bp.enable_ses)} />
          <Toggle label="SEB" on={bp.enable_seb} onClick={() => onBridgeParam("enable_seb")(!bp.enable_seb)} />
          <Toggle label="Auto" on={bp.send_mode_auto} onClick={() => onBridgeParam("send_mode_auto")(!bp.send_mode_auto)} />
          <Toggle label="Sim" on={bp.sim_mode} onClick={() => onBridgeParam("sim_mode")(!bp.sim_mode)} />
          <Toggle label="Diag" on={bp.publish_brake_diag} onClick={() => onBridgeParam("publish_brake_diag")(!bp.publish_brake_diag)} />
        </div>
      </div>

      <button onClick={toggleEstop}
        className={`w-full rounded-md px-2 py-1.5 text-xs font-bold transition
          ${estopArmed ? "bg-red-600 text-white" : "bg-zinc-800 text-red-400 hover:bg-zinc-700"}`}>
        {estopArmed ? "EMERGENCY STOP (ACTIVE)" : "EMERGENCY STOP"}
      </button>
    </div>
  );
}
