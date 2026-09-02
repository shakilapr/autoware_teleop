import { create } from "zustand";
import {
  defaultIntent, defaultTelemetry, IntentSchema, TelemetrySchema,
  TEST_PROFILES,
} from "../lib/schemas";
import type { Intent, Telemetry, TestMode, BridgeParams, InputMode } from "../lib/schemas";

interface TeleopState {
  connected: boolean;
  intent: Intent;
  telemetry: Telemetry;
  estopArmed: boolean;
  ws: WebSocket | null;
  /** Keys currently held (keyboard mode). */
  keys: Partial<Record<string, boolean>>;
  /** Stream health: live | delayed | lost (from heartbeat + reconnect). */
  streamQuality: "live" | "delayed" | "lost" | "connecting";
  reconnectAttempts: number;
  setIntent: (patch: Partial<Intent>) => void;
  setGear: (gear: Intent["gear"]) => void;
  setTurn: (turn: Intent["turn_indicator"]) => void;
  toggleHazard: () => void;
  setOperationMode: (m: Intent["operation_mode"]) => void;
  setManualMode: (m: Intent["manual_control_mode"]) => void;
  setInputMode: (m: InputMode) => void;
  setLimit: (patch: Partial<BridgeParams>) => void;
  toggleEngage: () => void;
  setTestMode: (m: TestMode) => void;
  setBridgeParam: (patch: Partial<BridgeParams>) => void;
  keyDown: (k: string) => void;
  keyUp: (k: string) => void;
  toggleEstop: () => void;
  connect: (url?: string) => void;
  _send: (intent: Intent) => void;
}

export const useTeleop = create<TeleopState>((set, get) => ({
  connected: false,
  intent: { ...defaultIntent },
  telemetry: { ...defaultTelemetry },
  estopArmed: false,
  ws: null,
  keys: {},
  streamQuality: "connecting",
  reconnectAttempts: 0,

  _send: (intent) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(IntentSchema.parse(intent)));
    }
  },

  setIntent: (patch) => {
    const next = { ...get().intent, ...patch, sequence: get().intent.sequence + 1 };
    set({ intent: next });
    get()._send(next);
  },

  setGear: (gear) => get().setIntent({ gear }),
  setTurn: (turn_indicator) => get().setIntent({ turn_indicator }),
  toggleHazard: () => get().setIntent({ hazard: !get().intent.hazard }),
  setOperationMode: (operation_mode) => get().setIntent({ operation_mode }),
  setManualMode: (manual_control_mode) => get().setIntent({ manual_control_mode }),
  setInputMode: (input_mode) => get().setIntent({ input_mode }),

  setLimit: (patch) => {
    const next = {
      ...get().intent,
      bridge_params: { ...get().intent.bridge_params, ...patch },
      sequence: get().intent.sequence + 1,
    };
    set({ intent: next });
    get()._send(next);
  },

  keyDown: (k) => {
    // Only effective in keyboard mode.
    if (get().intent.input_mode !== "keyboard") return;
    set((s) => ({ keys: { ...s.keys, [k]: true } }));
    // Recompute axes from held keys.
    const keys = { ...get().keys, [k]: true };
    const throttle = keys["w"] ? 1 : keys["s"] ? -1 : 0;
    const steer = keys["a"] ? 1 : keys["d"] ? -1 : 0;
    const brake = keys["space"] ? 1 : 0;
    get().setIntent({ throttle, steer, brake });
  },

  keyUp: (k) => {
    set((s) => {
      const keys = { ...s.keys };
      delete keys[k];
      return { keys };
    });
    // Recompute axes from remaining held keys.
    const keys = get().keys;
    const throttle = keys["w"] ? 1 : keys["s"] ? -1 : 0;
    const steer = keys["a"] ? 1 : keys["d"] ? -1 : 0;
    const brake = keys["space"] ? 1 : 0;
    get().setIntent({ throttle, steer, brake });
  },

  toggleEngage: () => get().setIntent({ engage: !get().intent.engage }),

  setTestMode: (test_mode) => {
    const patch = TEST_PROFILES[test_mode];
    const next = {
      ...get().intent,
      test_mode,
      bridge_params: { ...get().intent.bridge_params, ...patch },
    };
    set({ intent: next });
    get()._send(next);
  },

  setBridgeParam: (patch) => {
    const next = {
      ...get().intent,
      bridge_params: { ...get().intent.bridge_params, ...patch },
    };
    set({ intent: next });
    get()._send(next);
  },

  toggleEstop: () => {
    const armed = !get().estopArmed;
    set({ estopArmed: armed });
    const next = { ...get().intent, estop: get().intent.estop + 1 };
    set({ intent: next });
    get()._send(next);
  },

  connect: (url) => {
    const wsUrl = url ?? (() => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${location.host}/ws`;
    })();
    const ws = new WebSocket(wsUrl);
    let lastMsg = Date.now();
    const mark = (q: TeleopState["streamQuality"]) =>
      set({ streamQuality: q });
    ws.onopen = () => {
      set({ connected: true, ws, reconnectAttempts: 0, streamQuality: "live" });
      lastMsg = Date.now();
    };
    ws.onclose = () => {
      set({ connected: false, ws: null, streamQuality: "lost" });
    };
    ws.onerror = () => set({ connected: false });
    ws.onmessage = (ev) => {
      lastMsg = Date.now();
      mark("live");
      try {
        const parsed = TelemetrySchema.parse(JSON.parse(ev.data));
        set({ telemetry: parsed });
      } catch {
        /* ignore malformed telemetry */
      }
    };
    set({ ws });
    // Independent freshness clock: a connected-but-silent socket degrades.
    const watch = window.setInterval(() => {
      const age = Date.now() - lastMsg;
      if (ws.readyState === WebSocket.OPEN) {
        if (age > 3000) mark("delayed");
        else if (age > 1500) mark("delayed");
        else mark("live");
      } else if (age > 1500) {
        mark("lost");
      } else if (age > 750) {
        mark("delayed");
      }
    }, 250);
    ws.addEventListener("close", () => window.clearInterval(watch));
  },
}));
