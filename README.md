# autoware_teleop

A standalone, community-oriented teleoperation extension for **Autoware Universe**.
Drive an Autoware vehicle from a browser (or terminal): inject manual control
commands and render live vehicle telemetry from the topics Autoware exposes.

Decoupled from any specific vehicle hardware. Supports two integration paths:

- **Direct vehicle interface** — `/control/command/*` + `/vehicle/status/*`
  (works with any compliant vehicle interface, including the E-Trike bridges).
- **ADAPI external-command** — `/external/selected/*` + operation-mode services
  (planned; the canonical gate-enforced remote-operator path).

## Repository layout

```
autoware_teleop/
├── autoware_teleop_msgs/    # Intent message package (source/sequence/axes/limits)
├── autoware_teleop/         # ROS 2 rclcpp lifecycle node (single control authority)
│   ├── config/teleop.yaml
│   └── launch/teleop.launch.xml
├── autoware_teleop_web/     # FastAPI WebSocket bridge + Pydantic schema
├── autoware_teleop_ui/      # React frontend (Vite + TS + Tailwind + zustand + zod)
└── docs/                    # architecture + work plan (tracked in av_project docs/)
```

## Components

| Component | Status |
|---|---|
| `autoware_teleop` (rclcpp lifecycle node, direct gateway) | implemented — node-enforced lock, authority limits, stale-sequence, explicit safe frame |
| `autoware_teleop_msgs` (Intent.msg) | implemented — `source`/`sequence`, `input_mode`, engage, authority limits |
| `autoware_teleop_web` (FastAPI WS bridge) | implemented — heartbeat/sequence, freshness, sim provenance, typed errors |
| `autoware_teleop_ui` (React frontend) | implemented — 3-column console, keyboard ramp, command meters, ROS2 output topics |
| `ecu_sim.py` (vcan ECU simulator) | implemented (in `direct_bridge/scripts/`) |

## Run

### Build the ROS packages

```bash
colcon build --packages-select autoware_teleop_msgs autoware_teleop
source install/setup.bash
```

### Node (headless, direct gateway)

```bash
ros2 run autoware_teleop autoware_teleop --ros-args --params-file \
  $(rospack find autoware_teleop)/config/teleop.yaml
# or
ros2 launch autoware_teleop teleop.launch.xml
```

The node is a `LifecycleNode`; activate it (e.g. via the lifecycle CLI) before it
publishes commands.

### Web backend

```bash
cd autoware_teleop_web
pip install -e .        # requires rclpy + autoware_teleop_msgs installed
uvicorn app.main:app --host 0.0.0.0 --port 8080
# open http://<host>:8080
```

### Frontend (dev)

```bash
cd autoware_teleop_ui
npm install
npm run dev             # http://localhost:5173  (proxies /ws to the backend)
npm run build           # production build into dist/
```

### Closed-loop bench (no hardware)

```bash
# simulator emits ECU status frames on vcan1
python3 our_packages/direct_bridge/scripts/ecu_sim.py --interface vcan1 &

# web backend (runs the rclpy bridge + serves the UI)
python3 autoware_teleop_web/app/main.py --port 8080
```

## WebSocket contract (`/ws`)

- **Send** — `Intent` JSON (axes in `[-1,1]`, `source`/`sequence`, `input_mode`,
  `engage`, authority-limit `bridge_params`, `estop` monotonic counter).
- **Receive** — `Telemetry` JSON, pushed every ~250 ms (coalesced heartbeat; a
  `{"type":"ping"}` keeps liveness when nothing changed). Carries per-topic
  freshness/age, `simulated` provenance, and a `requested` command split.

Typed schemas live in `autoware_teleop_web/app/schemas.py` (Pydantic) mirrored by
`autoware_teleop_ui/src/lib/schemas.ts` (Zod).

## Control model

- **Operation modes** (requested intent, node-enforced): `STOP` (safe),
  `FULL` (Autoware Universe drives — teleop command publishers are **deactivated**,
  viewing only), `SIM` (Autoware sim — viewing only), `REMOTE` (teleop drives
  **only when ENGAGED**).
- **Single authority** — the node is the only publisher of `/control/command/*`.
  The web bridge is a thin transport; the browser is never trusted to gate.
- **Control lock** — `engage=false` forces zero velocity + NEUTRAL in the node
  (LOCKED overlay in the UI). ENGAGE is required to move (REMOTE only).
- **Conflict detection** — based on `/vehicle/status/control_mode`
  (`ControlModeReport`) feedback, not topic-graph heuristics: **red conflict**
  when REMOTE+engaged while the vehicle reports AUTONOMOUS; **amber warning**
  when REMOTE+disengaged while AUTONOMOUS; **AUTO confirmed** when FULL/SIM and
  the vehicle is AUTONOMOUS. Telemetry carries requested vs actual mode.
- **Input mode** — `raw` (sliders) vs `keyboard` (WASD). Node ignores axes that
  aren't valid for the active mode.
- **Authority limits** — operator-set `max_speed_forward/reverse`,
  `max_steering_angle`, `max_deceleration`; the node clamps commanded output to
  them (never above the parameter cap).
- **Ownership** — monotonic `sequence` per source; stale/regressed intents are
  rejected; on browser disconnect the node publishes an explicit safe frame.
- **Keyboard ramp** — game-like: holding W/S/A/D/Space ramps the axis up slowly
  and decays back to neutral on release.

## Tests

```bash
# Web schemas (no ROS needed)
cd autoware_teleop_web && python -m pytest test/
```

UI builds with `npm run build` (tsc + vite).

## Design principles

- **Transport-blind core** — control loop over an intent source + telemetry sink,
  behind an `AutowareGateway` seam.
- **Safety first** — node-enforced lock, authority limits, deadman watchdog,
  emergency stop, lifecycle-managed output, explicit safe frame on loss.
- **Frontend is ROS-free** — talks only to the FastAPI WebSocket schema.
- **Headless operation** — the node runs standalone via `ros2 run` + params.

See `docs/autoware_teleop/teleop-architecture.md` for the full design and
`docs/autoware_teleop/work-plan.md` for the roadmap (tracked in the av_project
repo).
