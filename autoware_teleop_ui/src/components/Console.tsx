import { useTeleop } from "../stores/teleop";
import { GEAR, INPUT_MODES, MANUAL_MODES, OPERATION_MODES, TEST_MODES } from "../lib/schemas";
import type { BridgeParams } from "../lib/schemas";
function AxisSlider({ label, value, min, max, step, onChange, accent, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; accent?: string; disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 appearance-none rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: `linear-gradient(to right, ${accent ?? "#3b82f6"} ${pct}%, #27272a ${pct}%)` }} />
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange, label }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-zinc-500">{label}</span>}
      <div className="flex rounded-md bg-zinc-800 p-0.5">
        {options.map((o) => (
          <button key={o}
            onClick={() => onChange(o)}
            className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition
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
      className={`flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition
        ${on ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/40" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
      <span>{label}</span>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-400" : "bg-zinc-600"}`} />
    </button>
  );
}

export function Console() {
  const intent = useTeleop((s) => s.intent);
  const setIntent = useTeleop((s) => s.setIntent);
  const setGear = useTeleop((s) => s.setGear);
  const setTurn = useTeleop((s) => s.setTurn);
  const toggleHazard = useTeleop((s) => s.toggleHazard);
  const setOperationMode = useTeleop((s) => s.setOperationMode);
  const setManualMode = useTeleop((s) => s.setManualMode);
  const toggleEngage = useTeleop((s) => s.toggleEngage);
  const setTestMode = useTeleop((s) => s.setTestMode);
  const setBridgeParam = useTeleop((s) => s.setBridgeParam);
  const toggleEstop = useTeleop((s) => s.toggleEstop);
  const estopArmed = useTeleop((s) => s.estopArmed);
  const setInputMode = useTeleop((s) => s.setInputMode);
  const setLimit = useTeleop((s) => s.setLimit);
  const streamQuality = useTeleop((s) => s.streamQuality);
  const bp = intent.bridge_params;
  const isKeyboard = intent.input_mode === "keyboard";
  const locked = !intent.engage;

  const onBridgeParam = (key: keyof BridgeParams) => (on: boolean) =>
    setBridgeParam({ [key]: on } as Partial<BridgeParams>);

  const qLabel =
    streamQuality === "live"
      ? "LIVE"
      : streamQuality === "delayed"
        ? "DELAYED"
        : streamQuality === "lost"
          ? "LOST"
          : "CONNECTING";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4 relative">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Game Console</h2>
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

      {/* Input mode toggle */}
      <Segmented options={INPUT_MODES} value={intent.input_mode}
        onChange={setInputMode} label="Input Mode" />

      {/* Operation + manual mode toggles */}
      <Segmented options={OPERATION_MODES} value={intent.operation_mode}
        onChange={setOperationMode} label="Operation Mode" />
      <Segmented options={MANUAL_MODES} value={intent.manual_control_mode}
        onChange={setManualMode} label="Manual Control Mode" />

      {/* Engage */}
      <button onClick={toggleEngage}
        className={`w-full rounded-md px-3 py-2 text-sm font-bold transition
          ${intent.engage ? "bg-green-600 text-white" : "bg-zinc-800 text-green-400 hover:bg-zinc-700"}`}>
        {intent.engage ? "ENGAGED (ON)" : "ENGAGE"}
      </button>

      {/* Drive axes */}
      <div className="space-y-3">
        <AxisSlider label="Throttle" value={intent.throttle} min={-1} max={1} step={0.01}
          onChange={(v) => setIntent({ throttle: v })} accent="#22c55e" disabled={isKeyboard || locked} />
        <AxisSlider label="Brake" value={intent.brake} min={0} max={1} step={0.01}
          onChange={(v) => setIntent({ brake: v })} accent="#ef4444" disabled={isKeyboard || locked} />
        <AxisSlider label="Steering" value={intent.steer} min={-1} max={1} step={0.01}
          onChange={(v) => setIntent({ steer: v })} accent="#3b82f6" disabled={isKeyboard || locked} />
      </div>

      {/* Authority limits — operator-set ceiling, enforced in the node */}
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <span className="text-xs text-zinc-500">Authority Limits (node-clamped)</span>
        <AxisSlider label="Max fwd speed (m/s)" value={bp.max_speed_forward} min={0} max={3} step={0.05}
          onChange={(v) => setLimit({ max_speed_forward: v })} accent="#22c55e" />
        <AxisSlider label="Max rev speed (m/s)" value={bp.max_speed_reverse} min={0} max={0.5} step={0.05}
          onChange={(v) => setLimit({ max_speed_reverse: v })} accent="#ef4444" />
        <AxisSlider label="Max steering (rad)" value={bp.max_steering_angle} min={0} max={0.747} step={0.01}
          onChange={(v) => setLimit({ max_steering_angle: v })} accent="#3b82f6" />
        <AxisSlider label="Max brake accel (m/s²)" value={bp.max_deceleration} min={0} max={5} step={0.1}
          onChange={(v) => setLimit({ max_deceleration: v })} accent="#f59e0b" />
      </div>

      {/* Gear */}
      <div className="flex gap-2">
        {GEAR.filter((g) => g !== "NEUTRAL").map((g) => (
          <button key={g} onClick={() => setGear(g)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition
              ${intent.gear === g ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
            {g}
          </button>
        ))}
      </div>

      {/* Lights */}
      <div className="flex gap-2">
        <Segmented options={["NONE", "LEFT", "RIGHT"]} value={intent.turn_indicator}
          onChange={setTurn} label="Turn" />
        <Toggle label="Hazard" on={intent.hazard} onClick={toggleHazard} />
      </div>

      {/* Test mode profiles */}
      <div className="border-t border-zinc-800 pt-3">
        <span className="text-xs text-zinc-500">Test Modes</span>
        <Segmented options={TEST_MODES} value={intent.test_mode} onChange={setTestMode} />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Toggle label="MTR" on={bp.enable_mtr} onClick={() => onBridgeParam("enable_mtr")(!bp.enable_mtr)} />
          <Toggle label="SES" on={bp.enable_ses} onClick={() => onBridgeParam("enable_ses")(!bp.enable_ses)} />
          <Toggle label="SEB" on={bp.enable_seb} onClick={() => onBridgeParam("enable_seb")(!bp.enable_seb)} />
          <Toggle label="Auto mode" on={bp.send_mode_auto} onClick={() => onBridgeParam("send_mode_auto")(!bp.send_mode_auto)} />
          <Toggle label="Sim mode" on={bp.sim_mode} onClick={() => onBridgeParam("sim_mode")(!bp.sim_mode)} />
          <Toggle label="Brake diag" on={bp.publish_brake_diag} onClick={() => onBridgeParam("publish_brake_diag")(!bp.publish_brake_diag)} />
        </div>
      </div>

      {/* Emergency */}
      <button onClick={toggleEstop}
        className={`w-full rounded-md px-3 py-2 text-sm font-bold transition
          ${estopArmed ? "bg-red-600 text-white" : "bg-zinc-800 text-red-400 hover:bg-zinc-700"}`}>
        {estopArmed ? "EMERGENCY STOP (ACTIVE)" : "EMERGENCY STOP"}
      </button>

      {/* Locked overlay */}
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
  );
}
