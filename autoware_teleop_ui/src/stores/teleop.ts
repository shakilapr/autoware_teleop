import { create } from "zustand";
import {
  defaultIntent, defaultTelemetry, IntentSchema, TelemetrySchema,
  TEST_PROFILES,
} from "../lib/schemas";
import type { Intent, Telemetry, TestMode, BridgeParams } from "../lib/schemas";

interface TeleopState {
  connected: boolean;
  intent: Intent;
  telemetry: Telemetry;
  estopArmed: boolean;
  ws: WebSocket | null;
  setIntent: (patch: Partial<Intent>) => void;
  setGear: (gear: Intent["gear"]) => void;
  setTurn: (turn: Intent["turn_indicator"]) => void;
  toggleHazard: () => void;
  setOperationMode: (m: Intent["operation_mode"]) => void;
  setManualMode: (m: Intent["manual_control_mode"]) => void;
  toggleEngage: () => void;
  setTestMode: (m: TestMode) => void;
  setBridgeParam: (patch: Partial<BridgeParams>) => void;
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

  _send: (intent) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(IntentSchema.parse(intent)));
    }
  },

  setIntent: (patch) => {
    const next = { ...get().intent, ...patch };
    set({ intent: next });
    get()._send(next);
  },

  setGear: (gear) => get().setIntent({ gear }),
  setTurn: (turn_indicator) => get().setIntent({ turn_indicator }),
  toggleHazard: () => get().setIntent({ hazard: !get().intent.hazard }),
  setOperationMode: (operation_mode) => get().setIntent({ operation_mode }),
  setManualMode: (manual_control_mode) => get().setIntent({ manual_control_mode }),
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
    ws.onopen = () => set({ connected: true, ws });
    ws.onclose = () => set({ connected: false, ws: null });
    ws.onerror = () => set({ connected: false });
    ws.onmessage = (ev) => {
      try {
        const parsed = TelemetrySchema.parse(JSON.parse(ev.data));
        set({ telemetry: parsed });
      } catch {
        /* ignore malformed telemetry */
      }
    };
    set({ ws });
  },
}));
