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

export function Dashboard() {
  const telemetry = useTeleop((s) => s.telemetry);
  const connected = useTeleop((s) => s.connected);
  const estopArmed = useTeleop((s) => s.estopArmed);
  const v = telemetry.vehicle;
  const wd = telemetry.watchdog_tripped;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
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
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-400">
        <div className="rounded bg-zinc-800 px-3 py-2">
          <div className="text-zinc-500">Operation Mode</div>
          <div className="font-mono text-zinc-100">{telemetry.mode.operation_mode}</div>
        </div>
        <div className="rounded bg-zinc-800 px-3 py-2">
          <div className="text-zinc-500">Drive Mode</div>
          <div className="font-mono text-zinc-100">{telemetry.mode.mode}</div>
        </div>
      </div>
      {telemetry.info && (
        <div className="mt-3 rounded bg-zinc-800 px-3 py-2 text-xs text-amber-300">
          {telemetry.info}
        </div>
      )}
    </div>
  );
}
