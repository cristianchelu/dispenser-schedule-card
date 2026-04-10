import type { DeviceConfig, ServiceCallActionConfig } from "../devices";
import type { DispenserScheduleCardConfig } from "../types/config";
import { defaultDeviceForPreset } from "./device-presets";

export function normalizeDeviceType(t: unknown): string {
  return String(t ?? "")
    .trim()
    .replace(/\u2013|\u2014/g, "-");
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function parseServiceActions(
  actionsUnknown: unknown
): ServiceCallActionConfig | undefined {
  if (!isRecord(actionsUnknown)) return undefined;
  const out: ServiceCallActionConfig = {};
  for (const k of ["add", "edit", "remove", "toggle"] as const) {
    const v = actionsUnknown[k];
    if (typeof v === "string" && v.trim().length > 0) {
      out[k] = v.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build `device` from whatever Lovelace / YAML actually stored.
 * - Preserves `custom` blocks as a deep clone.
 * - Infers Xiaomi 1 (ESPHome) when `device.entity` exists but `type` is missing.
 * - Migrates legacy top-level `entity` / `switch` / `actions` (README-style).
 */
function coerceDevice(loose: Record<string, unknown>): DeviceConfig {
  const d = loose.device;
  if (isRecord(d)) {
    const t = normalizeDeviceType(d.type);

    if (t === "custom") {
      return JSON.parse(JSON.stringify(d)) as DeviceConfig;
    }
    if (t === "xiaomi-smart-feeder-2") {
      return {
        type: "xiaomi-smart-feeder-2",
        entity: typeof d.entity === "string" ? d.entity : "",
      };
    }
    if (t === "xiaomi-smart-feeder") {
      const actions = parseServiceActions(d.actions);
      return {
        type: "xiaomi-smart-feeder",
        entity: typeof d.entity === "string" ? d.entity : "",
        ...(typeof d.switch === "string" && d.switch.trim().length > 0
          ? { switch: d.switch.trim() }
          : {}),
        ...(actions ? { actions } : {}),
      };
    }

    // `device:` with entity but no usable type → treat as Xiaomi 1 (ESPHome)
    if (typeof d.entity === "string" && d.entity.trim().length > 0) {
      const actions = parseServiceActions(d.actions);
      return {
        type: "xiaomi-smart-feeder",
        entity: d.entity.trim(),
        ...(typeof d.switch === "string" && d.switch.trim().length > 0
          ? { switch: d.switch.trim() }
          : {}),
        ...(actions ? { actions } : {}),
      };
    }
  }

  // Legacy flat card keys (not under `device:`)
  if (typeof loose.entity === "string" && loose.entity.trim().length > 0) {
    const actions = parseServiceActions(loose.actions);
    return {
      type: "xiaomi-smart-feeder",
      entity: loose.entity.trim(),
      ...(typeof loose.switch === "string" && loose.switch.trim().length > 0
        ? { switch: loose.switch.trim() }
        : {}),
      ...(actions ? { actions } : {}),
    };
  }

  return defaultDeviceForPreset("xiaomi-smart-feeder-2");
}

/**
 * Normalize editor-bound card config: reliable `device`, no duplicate legacy keys.
 */
/** Required on every `config-changed` payload or Lovelace may ignore updates. */
export const LOVELACE_CARD_TYPE = "custom:dispenser-schedule-card";

export function coerceCardConfigForEditor(
  raw: unknown
): DispenserScheduleCardConfig {
  const loose = JSON.parse(JSON.stringify(raw ?? {})) as Record<
    string,
    unknown
  >;
  const device = coerceDevice(loose);
  const {
    entity: _e,
    switch: _s,
    actions: _a,
    device: _d,
    type: looseType,
    ...rest
  } = loose;
  const merged = {
    ...rest,
    device,
    type:
      typeof looseType === "string" && looseType.length > 0
        ? looseType
        : LOVELACE_CARD_TYPE,
  } as DispenserScheduleCardConfig;
  return JSON.parse(JSON.stringify(merged)) as DispenserScheduleCardConfig;
}
