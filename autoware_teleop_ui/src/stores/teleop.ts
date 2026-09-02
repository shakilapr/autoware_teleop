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
  /** Arm (true) or clear (false) emergency stop. */
  setEstop: (armed: boolean) => void;
  /** Release all held keys + zero axes (blur / tab-hide / disconnect). */
  releaseAll: () => void;
  connect: (url?: string) => () => void;
  _send: (intent: Intent) => void;
}

/** True when the stream is not currently live (delayed/lost/connecting). */
export function streamIsStale(q: TeleopState["streamQuality"]): boolean {
  return q !== "live";
}

// Module-level socket lifecycle so StrictMode double-mount never opens two
// sockets: connect() is a singleton for one URL.
let _activeUrl: string | null = null;
let _ws: WebSocket | null = null;
let _retry = 0;
let _reconnectTimer: number | undefined;
let _watch: number | undefined;

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

  setEstop: (armed: boolean) => {
    if (armed === get().estopArmed) return;
    set({ estopArmed: armed });
    const next = { ...get().intent, estop: get().intent.estop + 1 };
    set({ intent: next });
    get()._send(next);
  },

  /**
   * Safety: release every held key and zero the axes. Called on window blur,
   * tab-hidden, and disconnect so the vehicle stops instead of holding the
   * last command.
   */
  releaseAll: () => {
    set({ keys: {} });
    const i = get().intent;
    if (i.throttle !== 0 || i.brake !== 0 || i.steer !== 0) {
      get().setIntent({ throttle: 0, brake: 0, steer: 0 });
    }
  },

  connect: (url) => {
    const wsUrl = url ?? (() => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${location.host}/ws`;
    })();

    // Singleton: if this URL is already the active connection, do nothing so
    // React StrictMode double-effect cannot open two sockets.
    if (_activeUrl === wsUrl && (_ws || _reconnectTimer !== undefined)) {
      return () => {};
    }
    _activeUrl = wsUrl;

    const mark = (q: TeleopState["streamQuality"]) =>
      set({ streamQuality: q });
    let lastMsg = Date.now();

    const open = () => {
      if (_activeUrl !== wsUrl) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      _ws = ws;
      set({ ws });
      ws.onopen = () => {
        _retry = 0;
        lastMsg = Date.now();
        set({ connected: true, reconnectAttempts: 0, streamQuality: "live" });
      };
      ws.onclose = () => {
        if (_ws !== ws) return; // a newer socket owns the lifecycle
        _ws = null;
        set({ connected: false, ws: null, streamQuality: "lost" });
        get().releaseAll();
        scheduleReconnect();
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        lastMsg = Date.now();
        mark("live");
        try {
          const data = JSON.parse(ev.data);
          // Compact heartbeat/ping frames carry no telemetry — just liveness.
          if (data && data.type === "ping") {
            const seq = data.stream?.sequence;
            if (typeof seq === "number") {
              set((s) => ({
                telemetry: {
                  ...s.telemetry,
                  stream: { sequence: seq, heartbeat_ok: true },
                },
              }));
            }
            return;
          }
          const parsed = TelemetrySchema.parse(data);
          set({ telemetry: parsed });
        } catch {
          /* ignore malformed telemetry */
        }
      };
    };

    const scheduleReconnect = () => {
      if (_activeUrl !== wsUrl || _reconnectTimer !== undefined) return;
      _retry += 1;
      set({ reconnectAttempts: _retry });
      // Exponential backoff with a 8s cap.
      const delay = Math.min(8000, 500 * 2 ** _retry);
      _reconnectTimer = window.setTimeout(() => {
        _reconnectTimer = undefined;
        open();
      }, delay);
    };

    open();
    // Independent freshness clock: a connected-but-silent socket degrades.
    _watch = window.setInterval(() => {
      const age = Date.now() - lastMsg;
      const ws = _ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        mark(age > 1500 ? "delayed" : "live");
      } else if (age > 1500) {
        mark("lost");
      } else if (age > 750) {
        mark("delayed");
      }
    }, 250);

    // Cleanup: only tear down if we are still the active connection.
    return () => {
      if (_activeUrl !== wsUrl) return;
      _activeUrl = null;
      if (_reconnectTimer !== undefined) {
        window.clearTimeout(_reconnectTimer);
        _reconnectTimer = undefined;
      }
      if (_watch !== undefined) {
        window.clearInterval(_watch);
        _watch = undefined;
      }
      _ws?.close();
      _ws = null;
    };
  },
}));
