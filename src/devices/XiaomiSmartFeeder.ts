import { Device, EntryStatus, ScheduleEntry } from "../types";

export default class XiaomiSmartFeeder extends Device {
  readonly maxEntries = 10;
  readonly maxAmount = 30;
  readonly minAmount = 1;
  readonly statusPattern = /(?<id>[0-9]),(?<hour>[0-9]{1,3}),(?<minute>[0-9]{1,3}),(?<amount>[0-9]{1,3}),(?<status>[0-9]{1,3}),?/g;
  readonly statusMap: Record<number, EntryStatus> = {
    0: EntryStatus.DISPENSED,
    1: EntryStatus.FAILED,
    254: EntryStatus.DISPENSING,
    255: EntryStatus.PENDING,
  };

  getSchedule(state: string) {
    const schedules: Array<ScheduleEntry> = [];
    let res;
    while ((res = this.statusPattern.exec(state)) !== null) {
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