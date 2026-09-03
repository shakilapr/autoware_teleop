import { z } from "zod";

/** Mirrors autoware_teleop_web/app/schemas.py */

export const GEAR = ["PARK", "DRIVE", "REVERSE", "NEUTRAL"] as const;
export type Gear = (typeof GEAR)[number];

export const INPUT_MODES = ["raw", "keyboard"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const OPERATION_MODES = ["STOP", "FULL", "SIM", "REMOTE"] as const;
export type OperationMode = (typeof OPERATION_MODES)[number];

export const MANUAL_MODES = ["DISABLED", "PEDALS", "ACCELERATION", "VELOCITY"] as const;
export type ManualMode = (typeof MANUAL_MODES)[number];

export const TURN = ["NONE", "LEFT", "RIGHT"] as const;
export type Turn = (typeof TURN)[number];

export const TEST_MODES = ["manual", "auto", "sim", "mtr_only", "ses_only", "seb_only"] as const;
export type TestMode = (typeof TEST_MODES)[number];

export const BridgeParamsSchema = z.object({
  enable_mtr: z.boolean(),
  enable_ses: z.boolean(),
  enable_seb: z.boolean(),
  send_mode_auto: z.boolean(),
  sim_mode: z.boolean(),
  publish_brake_diag: z.boolean(),
  max_speed_forward: z.number(),
  max_speed_reverse: z.number(),
  max_steering_angle: z.number(),
  max_deceleration: z.number(),
});
export type BridgeParams = z.infer<typeof BridgeParamsSchema>;

export const IntentSchema = z.object({
  input_mode: z.enum(INPUT_MODES).default("raw"),
  throttle: z.number().min(-1).max(1),
  brake: z.number().min(0).max(1),
  steer: z.number().min(-1).max(1),
  gear: z.enum(GEAR),
  turn_indicator: z.enum(TURN),
  hazard: z.boolean(),
  operation_mode: z.enum(OPERATION_MODES),
  manual_control_mode: z.enum(MANUAL_MODES),
  engage: z.boolean(),
  test_mode: z.enum(TEST_MODES),
  bridge_params: BridgeParamsSchema,
  mode_cycle: z.number().int().min(0).default(0),
  toggle_auto: z.number().int().min(0).default(0),
  reset_pose: z.number().int().min(0).default(0),
  estop: z.number().int().min(0).default(0),
  source: z.string().default("web"),
  sequence: z.number().int().min(0).default(0),
});
export type Intent = z.infer<typeof IntentSchema>;

export const TelemetrySchema = z.object({
  mode: z.object({
    operation_mode: z.enum(OPERATION_MODES),
    actual_vehicle_mode: z.string(),
    manual_control_mode: z.enum(MANUAL_MODES),
    drive_mode: z.string(),
    mode_status: z.string(),
    autoware_conflict: z.boolean().default(false),
    autoware_warning: z.boolean().default(false),
    autoware_auto_confirmed: z.boolean().default(false),
  }),
  vehicle: z.object({
    velocity: z.number(),
    steer_angle: z.number(),
    gear: z.enum(GEAR),
    turn_indicator: z.enum(TURN),
    hazard: z.boolean(),
    freshness: z.string(),
    age_ms: z.number(),
  }),
  target: z.object({
    target_velocity: z.number(),
    target_acceleration: z.number(),
    target_steer: z.number(),
  }),
  shift: z.object({ shift_state: z.string(), pending_gear: z.string() }),
  test_mode: z.enum(TEST_MODES),
  watchdog_tripped: z.boolean(),
  info: z.string(),
  timestamp: z.number(),
  simulated: z.boolean(),
  requested: z.object({
    speed: z.number(),
    steer: z.number(),
    gear: z.enum(GEAR),
  }),
  stream: z.object({
    sequence: z.number(),
    heartbeat_ok: z.boolean(),
  }),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

export const defaultBridgeParams: BridgeParams = {
  enable_mtr: true, enable_ses: true, enable_seb: true,
  send_mode_auto: true, sim_mode: false, publish_brake_diag: false,
  max_speed_forward: 3.0, max_speed_reverse: 0.5,
  max_steering_angle: 0.747, max_deceleration: 5.0,
};

export const defaultIntent: Intent = {
  input_mode: "raw",
  throttle: 0, brake: 0, steer: 0, gear: "NEUTRAL",
  turn_indicator: "NONE", hazard: false,
  operation_mode: "STOP", manual_control_mode: "VELOCITY", engage: false,
  test_mode: "manual", bridge_params: { ...defaultBridgeParams },
  mode_cycle: 0, toggle_auto: 0, reset_pose: 0, estop: 0,
  source: "web", sequence: 0,
};

export const defaultTelemetry: Telemetry = {
  mode: { operation_mode: "STOP", actual_vehicle_mode: "UNKNOWN", manual_control_mode: "VELOCITY", drive_mode: "stop", mode_status: "", autoware_conflict: false, autoware_warning: false, autoware_auto_confirmed: false },
  vehicle: { velocity: 0, steer_angle: 0, gear: "NEUTRAL", turn_indicator: "NONE", hazard: false, freshness: "unseen", age_ms: 0 },
  target: { target_velocity: 0, target_acceleration: 0, target_steer: 0 },
  shift: { shift_state: "", pending_gear: "" },
  test_mode: "manual",
  watchdog_tripped: false, info: "", timestamp: 0,
  simulated: false,
  requested: { speed: 0, steer: 0, gear: "NEUTRAL" },
  stream: { sequence: 0, heartbeat_ok: true },
};

/** Predefined test profiles mapping to bridge params. */
export const TEST_PROFILES: Record<TestMode, Partial<BridgeParams>> = {
  manual: { enable_mtr: true, enable_ses: true, enable_seb: true, send_mode_auto: true, sim_mode: false },
  auto: { enable_mtr: true, enable_ses: true, enable_seb: true, send_mode_auto: true, sim_mode: false },
  sim: { sim_mode: true, send_mode_auto: true },
  mtr_only: { enable_mtr: true, enable_ses: false, enable_seb: false },
  ses_only: { enable_mtr: false, enable_ses: true, enable_seb: false },
  seb_only: { enable_mtr: false, enable_ses: false, enable_seb: true },
};
