import { useTeleop } from "../stores/teleop";

function Gauge({ label, unit, display }: {
  label: string; unit: string; display: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-center">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold text-zinc-100">{display}</div>
      <div className="text-[10px] text-zinc-500">{unit}</div>
    </div>
  );
}

function Lamp({ label, on, color }: { label: string; on: boolean; color: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-zinc-800 px-2 py-1 text-[11px]">
      <span className="text-zinc-400">{label}</span>
      <span className={`rounded px-1 py-0.5 font-medium ${on ? color : "text-zinc-600"}`}>
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
  const req = telemetry.requested;
  const freshTone =
    v.freshness === "live"
      ? "text-green-400"
      : v.freshness === "late"
        ? "text-amber-400"
        : v.freshness === "missing"
          ? "text-red-400"
          : "text-zinc-600";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Dashboard</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className={connected ? "text-green-400" : "text-red-400"}>
            {connected ? "connected" : "disconnected"}
          </span>
          {telemetry.simulated && (
            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-white" title="Synthetic reports (sim mode)">
              SIM
            </span>
          )}
          {estopArmed && <span className="rounded bg-red-600 px-1.5 py-0.5 text-white">ESTOP</span>}
          {wd && <span className="rounded bg-amber-600 px-1.5 py-0.5 text-white">DEADMAN</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Gauge label="Speed" unit="m/s" display={v.velocity.toFixed(1)} />
        <Gauge label="Steering" unit="rad" display={v.steer_angle.toFixed(2)} />
        <Gauge label="Gear" unit="" display={v.gear} />
      </div>

      {/* Command vs feedback split */}
      <div className="rounded bg-zinc-800 px-3 py-2 text-xs">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-zinc-500">Cmd vs feedback</span>
          <span className={`font-mono ${freshTone}`}>
            {v.freshness} · {v.age_ms.toFixed(0)} ms
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 font-mono text-zinc-300">
          <div>
            speed <span className="text-zinc-500">cmd</span> {req.speed.toFixed(1)}
            <span className="text-zinc-500"> / fbk</span> {v.velocity.toFixed(1)} m/s
          </div>
          <div>
            steer <span className="text-zinc-500">cmd</span> {req.steer.toFixed(2)}
            <span className="text-zinc-500"> / fbk</span> {v.steer_angle.toFixed(2)} rad
          </div>
          <div>
            gear <span className="text-zinc-500">cmd</span> {req.gear}
            <span className="text-zinc-500"> / fbk</span> {v.gear}
          </div>
          <div>
            limits <span className="text-zinc-500">fwd</span>{" "}
            {intent.bridge_params.max_speed_forward.toFixed(1)} m/s
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Lamp label="Left" on={v.turn_indicator === "LEFT" || v.hazard} color="bg-amber-500 text-black" />
        <Lamp label="Right" on={v.turn_indicator === "RIGHT" || v.hazard} color="bg-amber-500 text-black" />
        <Lamp label="Hazard" on={v.hazard} color="bg-red-500 text-white" />
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-400">
        <div className="rounded bg-zinc-800 px-2 py-1.5">
          <div className="text-zinc-500">Operation Mode</div>
          <div className="font-mono text-zinc-100">{telemetry.mode.operation_mode}</div>
        </div>
        <div className="rounded bg-zinc-800 px-2 py-1.5">
          <div className="text-zinc-500">Manual Control</div>
          <div className="font-mono text-zinc-100">{telemetry.mode.manual_control_mode}</div>
        </div>
        <div className="rounded bg-zinc-800 px-2 py-1.5">
          <div className="text-zinc-500">Drive Mode</div>
          <div className="font-mono text-zinc-100">{telemetry.mode.drive_mode}</div>
        </div>
        <div className="rounded bg-zinc-800 px-2 py-1.5">
          <div className="text-zinc-500">Test Mode</div>
          <div className="font-mono text-zinc-100">{telemetry.test_mode}</div>
        </div>
      </div>

      {telemetry.info && (
        <div className="rounded bg-zinc-800 px-2 py-1.5 text-[11px] text-amber-300">
          {telemetry.info}
        </div>
      )}
    </div>
  );
}
