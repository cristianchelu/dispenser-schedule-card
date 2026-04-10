import type { DeviceConfig } from "../devices";

/** Device types configurable from the UI (not `custom`). */
export type UiDevicePreset = Exclude<DeviceConfig["type"], "custom">;

export const DEVICE_PRESET_LABELS: Record<UiDevicePreset, string> = {
  "xiaomi-smart-feeder": "Xiaomi Smart Pet Food Feeder (ESPHome)",
  "xiaomi-smart-feeder-2": "Xiaomi Smart Pet Food Feeder 2 (Xiaomi)",
};

export const UI_DEVICE_PRESETS: UiDevicePreset[] = Object.keys(
  DEVICE_PRESET_LABELS
) as UiDevicePreset[];

export function defaultDeviceForPreset(type: UiDevicePreset): DeviceConfig {
  switch (type) {
    case "xiaomi-smart-feeder-2":
      return { type: "xiaomi-smart-feeder-2", entity: "" };
    case "xiaomi-smart-feeder":
      return { type: "xiaomi-smart-feeder", entity: "" };
  }
}
