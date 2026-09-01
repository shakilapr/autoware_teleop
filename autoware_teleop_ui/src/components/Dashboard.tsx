import { useTeleop } from "../stores/teleop";

function Gauge({ label, value, unit, display }: {
  label: string; value: number; unit: string; display: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-3xl font-semibold text-zinc-100">{display}</div>
      <div className="text-xs text-zinc-500">{unit}</div>
      <div className="mt-2 text-right text-xs font-mono text-zinc-600">raw {value.toFixed(3)}</div>
    </div>
  );
}

function Lamp({ label, on, color }: { label: string; on: boolean; color: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-zinc-800 px-3 py-1.5 text-xs">
      <span className="text-zinc-400">{label}</span>
      <span className={`rounded px-1.5 py-0.5 font-medium ${on ? color : "text-zinc-600"}`}>
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
  const v = telemetry.vehicle;
  const wd = telemetry.watchdog_tripped;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Dashboard</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className={connected ? "text-green-400" : "text-red-400"}>
            {connected ? "connected" : "disconnected"}
          </span>
          {estopArmed && <span className="rounded bg-red-600 px-1.5 py-0.5 text-white">ESTOP</span>}
          {wd && <span className="rounded bg-amber-600 px-1.5 py-0.5 text-white">DEADMAN</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Gauge label="Speed" value={v.velocity} unit="m/s" display={v.velocity.toFixed(1)} />
        <Gauge label="Steering" value={v.steer_angle} unit="rad" display={v.steer_angle.toFixed(2)} />
        <Gauge label="Gear" value={0} unit="" display={v.gear} />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Lamp label="Left" on={v.turn_indicator === "LEFT" || v.hazard} color="bg-amber-500 text-black" />
        <Lamp label="Right" on={v.turn_indicator === "RIGHT" || v.hazard} color="bg-amber-500 text-black" />
        <Lamp label="Hazard" on={v.hazard} color="bg-red-500 text-white" />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-zinc-400">
        <div className="rounded bg-zinc-800 px-3 py-2">
          <div className="text-zinc-500">Operation Mode</div>
          <div className="font-mono text-zinc-100">{telemetry.mode.operation_mode}</div>
        </div>
        <div className="rounded bg-zinc-800 px-3 py-2">
          <div className="text-zinc-500">Manual Control</div>
          <div className="font-mono text-zinc-100">{telemetry.mode.manual_control_mode}</div>
        </div>
        <div className="rounded bg-zinc-800 px-3 py-2">
          <div className="text-zinc-500">Drive Mode</div>
          <div className="font-mono text-zinc-100">{telemetry.mode.drive_mode}</div>
        </div>
        <div className="rounded bg-zinc-800 px-3 py-2">
          <div className="text-zinc-500">Test Mode</div>
          <div className="font-mono text-zinc-100">{telemetry.test_mode}</div>
        </div>
      </div>

      <div className="rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <div className="mb-1 text-zinc-500">Bridge Params</div>
        <div className="font-mono">
          {[
            `MTR:${intent.bridge_params.enable_mtr ? "on" : "off"}`,
            `SES:${intent.bridge_params.enable_ses ? "on" : "off"}`,
            `SEB:${intent.bridge_params.enable_seb ? "on" : "off"}`,
            `auto:${intent.bridge_params.send_mode_auto ? "on" : "off"}`,
            `sim:${intent.bridge_params.sim_mode ? "on" : "off"}`,
            `diag:${intent.bridge_params.publish_brake_diag ? "on" : "off"}`,
          ].join("  ")}
        </div>
      </div>

      {telemetry.info && (
        <div className="rounded bg-zinc-800 px-3 py-2 text-xs text-amber-300">
          {telemetry.info}
        </div>
      )}
    </div>
  );
}
