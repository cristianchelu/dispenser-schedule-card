import { Device } from "../types/common";
import { HomeAssistant } from "../types/ha";
import CustomDevice from "./CustomDevice";
import XiaomiSmartFeeder from "./XiaomiSmartFeeder";
import XiaomiSmartPetFeeder2 from "./XiaomiSmartPetFeeder2";

export type {
  CustomDeviceConfig,
  ServiceCallActionConfig,
} from "./CustomDevice";
export type { XiaomiSmartFeederDeviceConfig } from "./XiaomiSmartFeeder";
export type { XiaomiSmartPetFeeder2DeviceConfig } from "./XiaomiSmartPetFeeder2";

import type { CustomDeviceConfig } from "./CustomDevice";
import type { XiaomiSmartFeederDeviceConfig } from "./XiaomiSmartFeeder";
import type { XiaomiSmartPetFeeder2DeviceConfig } from "./XiaomiSmartPetFeeder2";

export type DeviceConfig =
  | CustomDeviceConfig
  | XiaomiSmartFeederDeviceConfig
  | XiaomiSmartPetFeeder2DeviceConfig;

export type DeviceType = DeviceConfig["type"];

export function createDevice(
  deviceConfig: DeviceConfig,
  hass: HomeAssistant
): Device {
  switch (deviceConfig.type) {
    case "xiaomi-smart-feeder":
      return new XiaomiSmartFeeder(deviceConfig, hass);
    case "xiaomi-smart-feeder-2":
      return new XiaomiSmartPetFeeder2(deviceConfig, hass);
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
