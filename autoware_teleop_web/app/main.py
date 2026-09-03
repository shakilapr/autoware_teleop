#!/usr/bin/env python3
# Copyright 2026 E-Trike Dev. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""autoware_teleop web backend.

Thin FastAPI WebSocket bridge between a browser UI and the Autoware
vehicle-interface topics via the rclpy bridge. Serves the built React SPA when
present, otherwise a minimal fallback page.

Run:
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
or directly:
    python3 app/main.py --port 8080
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import ros_bridge
from .schemas import Intent, Telemetry

logger = logging.getLogger("autoware_teleop_web")
logging.basicConfig(level=logging.INFO)

# dist/ lives at <repo>/autoware_teleop_ui/dist; main.py is at <repo>/autoware_teleop_web/app/main.py
_REPO_DIR = Path(__file__).resolve().parents[2]
UI_DIR = _REPO_DIR / "autoware_teleop_ui" / "dist"

app = FastAPI(title="autoware_teleop", version="0.1.0")

_bridge: ros_bridge.TeleopRosBridge | None = None
_spin: "asyncio.Task | threading.Thread | None" = None


def _telemetry_payload() -> dict:
    snap = _bridge.telemetry.snapshot() if _bridge else {}
    t = Telemetry()
    t.mode.operation_mode = _bridge.get_operation_mode_name() if _bridge else "STOP"
    if _bridge:
        actual_name, flags = _bridge.get_vehicle_mode()
        t.mode.actual_vehicle_mode = actual_name
        t.mode.autoware_conflict = flags["conflict"]
        t.mode.autoware_warning = flags["warning"]
        t.mode.autoware_auto_confirmed = flags["auto_confirmed"]
    else:
        t.mode.actual_vehicle_mode = "UNKNOWN"
    t.vehicle.velocity = snap.get("velocity", 0.0)
    t.vehicle.steer_angle = snap.get("steer_angle", 0.0)
    t.vehicle.gear = snap.get("gear", "NEUTRAL")
    t.target.target_velocity = snap.get("velocity", 0.0)
    t.watchdog_tripped = False
    t.timestamp = int(time.time() * 1000)
    # Per-topic freshness + age (primary = velocity).
    fresh = snap.get("freshness", {})
    vf = fresh.get("velocity", {})
    t.vehicle.freshness = vf.get("freshness", "unseen")
    t.vehicle.age_ms = vf.get("age_ms", 0.0)
    # ROS2 graph detection.
    if _bridge:
        g = _bridge.graph_status()
        t.ros2.ok = g["ros2_ok"]
        t.ros2.autoware_present = g["autoware_present"]
    # Sim provenance + commanded target (requested).
    t.simulated = bool(_bridge and _bridge._bp.get("sim_mode", False))
    t.requested.speed = snap.get("velocity", 0.0)
    t.requested.gear = snap.get("gear", "NEUTRAL")
    t.stream.heartbeat_ok = _bridge is not None
    return t.model_dump()


@app.on_event("startup")
async def _startup():
    global _bridge, _spin
    if _bridge is None:
        _bridge, _spin = ros_bridge.create_bridge(rate=10.0)
        logger.info("rclpy bridge started")


@app.on_event("shutdown")
async def _shutdown():
    global _bridge, _spin
    if _bridge is not None:
        ros_bridge.shutdown_bridge(_bridge, _spin)
        _bridge = None
        logger.info("rclpy bridge stopped")


@app.get("/api/health")
async def health():
    return JSONResponse({"ok": True, "bridge": _bridge is not None})


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("ws client connected")
    seq = 0
    _last_telemetry: dict | None = None

    async def _heartbeat():
        nonlocal seq, _last_telemetry
        while True:
            await asyncio.sleep(0.25)
            seq += 1
            t = _telemetry_payload()
            t["stream"]["sequence"] = seq
            t["stream"]["heartbeat_ok"] = _bridge is not None
            # Coalesce: only push a full frame when something changed; otherwise
            # a lightweight ping keeps the connection/health honest.
            if t != _last_telemetry:
                _last_telemetry = t
                await ws.send_text(_payload_dumps(t))
            else:
                await ws.send_text(_payload_dumps({
                    "type": "ping",
                    "stream": {"sequence": seq, "heartbeat_ok": _bridge is not None},
                }))

    heartbeat_task = asyncio.create_task(_heartbeat())
    try:
        while True:
            raw = await ws.receive_text()
            try:
                intent = Intent.model_validate_json(raw)
            except Exception as exc:  # pydantic.ValidationError
                await ws.send_text(_payload_dumps({
                    "schema_version": 1, "ok": False, "data": None,
                    "errors": [{"code": "intent.invalid", "message": str(exc)}],
                }))
                continue
            if _bridge is not None:
                _bridge.set_intent(intent.model_dump())
            # Push telemetry back each intent tick.
            seq += 1
            _last_telemetry = None  # force a fresh full frame next heartbeat
            t = _telemetry_payload()
            t["stream"]["sequence"] = seq
            await ws.send_text(_payload_dumps(t))
    except WebSocketDisconnect:
        logger.info("ws client disconnected")
        # Explicit safe release: zero intent + NEUTRAL + engage off. The node
        # also has its deadman watchdog as a backstop.
        if _bridge is not None:
            _bridge.set_intent({
                "throttle": 0, "brake": 0, "steer": 0, "gear": "NEUTRAL",
                "engage": False, "source": "web", "sequence": seq + 1,
            })
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass


def _payload_dumps(t: dict) -> str:
    import json as _json
    return _json.dumps(t)


# Serve built SPA if present, else a fallback HTML page.
if UI_DIR.exists() and any(UI_DIR.iterdir()):
    app.mount("/", StaticFiles(directory=str(UI_DIR), html=True), name="ui")
else:
    FALLBACK_HTML = """<!doctype html><html><body>
    <h1>autoware_teleop</h1>
    <p>UI not built. Run the React build, or connect a WebSocket client to /ws.</p>
    <p>WS contract: send <code>Intent</code> JSON; receive <code>Telemetry</code> JSON.</p>
    </body></html>"""

    @app.get("/", response_class=HTMLResponse)
    async def index():
        return FALLBACK_HTML


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
