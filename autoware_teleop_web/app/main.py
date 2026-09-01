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
    t.mode.mode = "stop"
    t.mode.operation_mode = "REMOTE"
    t.vehicle.velocity = snap.get("velocity", 0.0)
    t.vehicle.steer_angle = snap.get("steer_angle", 0.0)
    t.vehicle.gear = snap.get("gear", "NEUTRAL")
    t.target.target_velocity = snap.get("velocity", 0.0)
    t.watchdog_tripped = False
    t.timestamp = int(time.time() * 1000)
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
    try:
        while True:
            raw = await ws.receive_text()
            try:
                intent = Intent.model_validate_json(raw)
            except Exception as exc:  # pydantic.ValidationError
                await ws.send_text(f'{{"error": "invalid intent: {exc}"}}')
                continue
            if _bridge is not None:
                _bridge.set_intent(intent.model_dump())
                if intent.estop % 2 == 1:  # toggle semantics on odd count
                    _bridge.set_emergency(True)
                else:
                    _bridge.set_emergency(False)
            # push telemetry back each intent tick
            await ws.send_text(_telemetry_payload())
    except WebSocketDisconnect:
        logger.info("ws client disconnected")
        if _bridge is not None:
            _bridge.set_intent({"throttle": 0, "brake": 0, "steer": 0, "gear": "NEUTRAL"})
            _bridge.set_emergency(False)


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
