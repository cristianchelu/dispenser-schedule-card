import { Device, EntryStatus, ScheduleEntry } from "../types/common";
import { DispenserScheduleCardConfig } from "../types/config";

interface CustomDeviceConfig {
  type: "custom";
  status_pattern: string;
  status_map: Array<`${string} -> ${string}`>;
  max_entries: number;
  max_amount: number;
  min_amount: number;
  step_amount: number;
}

export default class CustomDevice extends Device {
  maxEntries: number;
  maxAmount: number;
  minAmount: number;
  stepAmount: number;

  statusPattern: RegExp;
  statusMap: Record<string, EntryStatus>;

  constructor(
    config: DispenserScheduleCardConfig<CustomDeviceConfig>,
    hass: any
  ) {
    super(config, hass);

    this.maxEntries = config.device.max_entries;
    this.maxAmount = config.device.max_amount;
    this.minAmount = config.device.min_amount;
    this.stepAmount = config.device.step_amount;

    this.statusPattern = new RegExp(config.device.status_pattern);
    this.statusMap = config.device.status_map.reduce((acc, item) => {
      const [key, value] = item.split(" -> ");
      return { ...acc, [key]: value };
    }, {});
  }

  getEntryStatus(entry: ScheduleEntry) {
    return this.statusMap[entry.status];
  }

  getSchedule(state: string) {
    const schedules: Array<ScheduleEntry> = [];
    let res,
      i = 0;
    const regex = new RegExp(this.statusPattern, "g");
    while ((res = regex.exec(state)) !== null && i < this.maxEntries) {
      schedules.push({
        id: parseInt(res.groups!.id),
        hour: parseInt(res.groups!.hour),
        minute: parseInt(res.groups!.minute),
        amount: parseInt(res.groups!.amount),
        status: this.statusMap[parseInt(res.groups!.status)],
      });
      i++;
    }
    return schedules
      .filter(({ hour }) => hour !== 255)
      .sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }
}
