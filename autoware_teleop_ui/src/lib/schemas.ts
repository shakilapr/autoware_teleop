import { z } from "zod";

/** Mirrors autoware_teleop_web/app/schemas.py */

export const GEAR = ["PARK", "DRIVE", "REVERSE", "NEUTRAL"] as const;
export type Gear = (typeof GEAR)[number];

export const IntentSchema = z.object({
  throttle: z.number().min(-1).max(1),
  brake: z.number().min(0).max(1),
  steer: z.number().min(-1).max(1),
  gear: z.enum(GEAR),
  mode_cycle: z.number().int().min(0).default(0),
  toggle_auto: z.number().int().min(0).default(0),
  reset_pose: z.number().int().min(0).default(0),
  estop: z.number().int().min(0).default(0),
});
export type Intent = z.infer<typeof IntentSchema>;

export const TelemetrySchema = z.object({
  mode: z.object({
    operation_mode: z.string(),
    mode: z.string(),
    mode_status: z.string(),
  }),
  vehicle: z.object({
    velocity: z.number(),
    steer_angle: z.number(),
    gear: z.enum(GEAR),
  }),
  target: z.object({
    target_velocity: z.number(),
    target_acceleration: z.number(),
    target_steer: z.number(),
  }),
  shift: z.object({ shift_state: z.string(), pending_gear: z.string() }),
  watchdog_tripped: z.boolean(),
  info: z.string(),
  timestamp: z.number(),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

export const defaultIntent: Intent = {
  throttle: 0, brake: 0, steer: 0, gear: "NEUTRAL",
  mode_cycle: 0, toggle_auto: 0, reset_pose: 0, estop: 0,
};

export const defaultTelemetry: Telemetry = {
  mode: { operation_mode: "STOP", mode: "stop", mode_status: "" },
  vehicle: { velocity: 0, steer_angle: 0, gear: "NEUTRAL" },
  target: { target_velocity: 0, target_acceleration: 0, target_steer: 0 },
  shift: { shift_state: "", pending_gear: "" },
  watchdog_tripped: false, info: "", timestamp: 0,
};
