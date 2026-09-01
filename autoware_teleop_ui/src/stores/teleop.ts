import { create } from "zustand";
import { defaultIntent, defaultTelemetry, IntentSchema, TelemetrySchema } from "../lib/schemas";
import type { Intent, Telemetry } from "../lib/schemas";

interface TeleopState {
  connected: boolean;
  intent: Intent;
  telemetry: Telemetry;
  estopArmed: boolean;
  ws: WebSocket | null;
  setIntent: (patch: Partial<Intent>) => void;
  setGear: (gear: Intent["gear"]) => void;
  toggleEstop: () => void;
  connect: (url?: string) => void;
}

export const useTeleop = create<TeleopState>((set, get) => ({
  connected: false,
  intent: { ...defaultIntent },
  telemetry: { ...defaultTelemetry },
  estopArmed: false,
  ws: null,

  setIntent: (patch) => {
    const next = { ...get().intent, ...patch };
    set({ intent: next });
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(IntentSchema.parse(next)));
    }
  },

  setGear: (gear) => get().setIntent({ gear }),

  toggleEstop: () => {
    const armed = !get().estopArmed;
    set({ estopArmed: armed });
    const intent = { ...get().intent, estop: get().intent.estop + 1 };
    set({ intent });
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(IntentSchema.parse(intent)));
    }
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
