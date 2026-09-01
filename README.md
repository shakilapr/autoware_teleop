# autoware_teleop

A standalone, community-oriented teleoperation extension for **Autoware Universe**.
Drive an Autoware vehicle from a terminal or a browser dashboard: inject manual
control commands and render live vehicle telemetry.

Decoupled from any specific vehicle hardware. Supports two integration paths:

- **Direct vehicle interface** — `/control/command/*` + `/vehicle/status/*`
  (works with any compliant vehicle interface, including the E-Trike bridges).
- **ADAPI external-command** — `/external/selected/*` + operation-mode services
  (planned; the canonical gate-enforced remote-operator path).

## Repository layout

```
autoware_teleop/
├── autoware_teleop/        # ROS 2 rclcpp lifecycle node
├── autoware_teleop_web/    # FastAPI WebSocket bridge + Pydantic schema
├── autoware_teleop_ui/     # React frontend (Vite + TS + Tailwind + shadcn)
└── docs/                   # architecture + work plan (in av_project docs/)
```

## Components

| Component | Status |
|---|---|
| `autoware_teleop` (rclcpp node, direct gateway) | implemented |
| `autoware_teleop_web` (FastAPI WS bridge) | implemented |
| `autoware_teleop_ui` (React frontend) | scaffolded (build next) |
| `ecu_sim.py` (vcan ECU simulator) | implemented (in direct_bridge/scripts/) |

## Run

### Node (headless, direct gateway)

```bash
colcon build --packages-select autoware_teleop
source install/setup.bash
ros2 run autoware_teleop autoware_teleop --ros-args --params-file \
  $(rospack find autoware_teleop)/config/teleop.yaml
```

### Web backend

```bash
cd autoware_teleop_web
pip install -e .
uvicorn app.main:app --host 0.0.0.0 --port 8080
# open http://<host>:8080
```

WebSocket contract: send `Intent` JSON on `/ws`, receive `Telemetry` JSON.

### Closed-loop bench (no hardware)

```bash
python3 our_packages/direct_bridge/scripts/ecu_sim.py --interface vcan1 &
python3 autoware_teleop_web/app/main.py --port 8080
```

## Design principles

- **Transport-blind core** — control loop over an intent source + telemetry sink,
  behind an `AutowareGateway` seam.
- **Safety first** — deadman watchdog, emergency stop, lifecycle-managed output.
- **Frontend is ROS-free** — talks only to the FastAPI WebSocket schema.
- **Headless operation** — the node runs standalone via `ros2 run` + params.

See `docs/autoware_teleop/teleop-architecture.md` for the full design and
`docs/autoware_teleop/work-plan.md` for the roadmap.
