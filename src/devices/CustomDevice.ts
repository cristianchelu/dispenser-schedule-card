import { Device, DispenserScheduleCardConfig, EntryStatus, ScheduleEntry } from "../types";

interface CustomDeviceConfig {
  status_pattern: string;
  status_map: Array<string>;
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
  statusMap: Record<number, EntryStatus>;

  constructor(config: DispenserScheduleCardConfig<CustomDeviceConfig>, hass: any) {
    super(config, hass);

    this.maxEntries = config.device_config.max_entries;
    this.maxAmount = config.device_config.max_amount;
    this.minAmount = config.device_config.min_amount;
    this.stepAmount = config.device_config.step_amount;

    this.statusPattern = new RegExp(config.device_config.status_pattern);
    this.statusMap = config.device_config.status_map.reduce((acc, item) => {
      const [key, value] = item.split(' -> ');
      return { ...acc, [parseInt(key)]: value };
    }, {});
  }

  getSchedule(state: string) {
    const schedules: Array<ScheduleEntry> = [];
    let res;
    const regex = new RegExp(this.statusPattern, 'g');
    while ((res = regex.exec(state)) !== null) {
      schedules.push({
        id: parseInt(res.groups!.id),
        hour: parseInt(res.groups!.hour),
        minute: parseInt(res.groups!.minute),
        amount: parseInt(res.groups!.amount),
        status: this.statusMap[parseInt(res.groups!.status)],
      });
    }
    return schedules.filter(({ hour }) => hour !== 255)
      .sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }
}