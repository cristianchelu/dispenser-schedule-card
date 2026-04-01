import CustomDevice, {
  CustomDeviceConfig,
  ServiceCallActionConfig,
} from "./CustomDevice";
import { HomeAssistant } from "../types/ha";

export interface XiaomiSmartFeederDeviceConfig {
  type: "xiaomi-smart-feeder";
  entity: string;
  switch?: string;
  actions?: ServiceCallActionConfig;
}

export default class XiaomiSmartFeeder extends CustomDevice {
  constructor(
    deviceConfig: XiaomiSmartFeederDeviceConfig,
    hass: HomeAssistant
  ) {
    const customConfig: CustomDeviceConfig = {
      type: "custom",
      entity: deviceConfig.entity,
      switch: deviceConfig.switch,
      actions: deviceConfig.actions,
      status_pattern:
        "(?<id>[0-9]),(?<hour>[0-9]{1,3}),(?<minute>[0-9]{1,3}),(?<amount>[0-9]{1,3}),(?<status>[0-9]{1,3}),?",
      status_map: [
        "0 -> dispensed",
        "1 -> failed",
        "254 -> dispensing",
        "255 -> pending",
      ],
      max_entries: 10,
      max_amount: 30,
      min_amount: 1,
      step_amount: 1,
    };
    super(customConfig, hass);
  }
}
