import { Device } from "../types/common";
import { HomeAssistant } from "../types/ha";
import CustomDevice from "./CustomDevice";
import XiaomiSmartFeeder from "./XiaomiSmartFeeder";

export type {
  CustomDeviceConfig,
  ServiceCallActionConfig,
} from "./CustomDevice";
export type { XiaomiSmartFeederDeviceConfig } from "./XiaomiSmartFeeder";

import type { CustomDeviceConfig } from "./CustomDevice";
import type { XiaomiSmartFeederDeviceConfig } from "./XiaomiSmartFeeder";

export type DeviceConfig = CustomDeviceConfig | XiaomiSmartFeederDeviceConfig;

export type DeviceType = DeviceConfig["type"];

export function createDevice(
  deviceConfig: DeviceConfig,
  hass: HomeAssistant
): Device {
  switch (deviceConfig.type) {
    case "xiaomi-smart-feeder":
      return new XiaomiSmartFeeder(deviceConfig, hass);
    case "custom":
      return new CustomDevice(deviceConfig, hass);
    default: {
      const _exhaustive: never = deviceConfig;
      throw new Error(
        `Unknown device type: ${(_exhaustive as { type: string }).type}`
      );
    }
  }
}
