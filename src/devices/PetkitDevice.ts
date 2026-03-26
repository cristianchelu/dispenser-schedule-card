import { Device, EntryStatus, ScheduleEntry, EditScheduleEntry } from "../types/common";
import { DispenserScheduleCardConfig } from "../types/config";

/**
 * PetKit feeder device handler.
 *
 * Unlike the per-entry CRUD model used by ESPHome/Xiaomi devices, PetKit
 * feeders require a _full 7-day schedule_ to be sent in every saveFeed API
 * call. This device implementation:
 *
 *  1. Parses the sensor state string (id,hour,minute,amount,status)
 *  2. Reads the full schedule from entity.attributes.feed_daily_list
 *  3. On add/edit/remove, mutates the relevant day's items in-place
 *  4. Calls petkit.set_feeding_schedule with the complete schedule
 */

interface PetkitDeviceConfig {
  type: "petkit";
  /** The PetKit device_id (integer) for the set_feeding_schedule service. */
  device_id: number;
}

/** PetKit status code → card EntryStatus mapping. */
const PETKIT_STATUS_MAP: Record<number, EntryStatus> = {
  0: EntryStatus.PENDING,
  1: EntryStatus.DISPENSED,
  2: EntryStatus.DISPENSED,
  3: EntryStatus.DISPENSED,
  6: EntryStatus.SKIPPED,
  7: EntryStatus.FAILED,
  8: EntryStatus.SKIPPED,
  9: EntryStatus.FAILED,
};

const SCHEDULE_REGEX =
  /(?<id>[0-9]+),(?<hour>[0-9]{1,2}),(?<minute>[0-9]{1,2}),(?<amount>[0-9]+),(?<status>[0-9]+),?/g;

export default class PetkitDevice extends Device {
  readonly maxEntries = 10;
  readonly maxAmount = 50;
  readonly minAmount = 1;
  readonly stepAmount = 1;

  private deviceId: number;

  get isDualHopper(): boolean {
    return true;
  }

  constructor(
    config: DispenserScheduleCardConfig<PetkitDeviceConfig>,
    hass: any,
  ) {
    super(config, hass);
    this.deviceId = config.device.device_id;
  }

  getSchedule(state: string): Array<ScheduleEntry> {
    // Try to get per-hopper amounts from entity attributes
    const entity = this.hass?.states?.[this.config.entity ?? ""];
    const feedDailyList = entity?.attributes?.feed_daily_list;

    // If we have per-hopper data from attributes, use it for day 1 (today)
    if (feedDailyList && Array.isArray(feedDailyList) && feedDailyList.length > 0) {
      return this._parseFromAttributes(feedDailyList[0], state);
    }

    // Fallback: parse state string (combined amounts only)
    return this._parseFromState(state);
  }

  /**
   * Parse schedule from entity attributes (first day), enriching with
   * live status from the state string.
   */
  private _parseFromAttributes(
    day: any,
    state: string,
  ): Array<ScheduleEntry> {
    // Build a status lookup from the state string, keyed by "hour:minute"
    const statusMap = new Map<string, EntryStatus>();
    const regex = new RegExp(SCHEDULE_REGEX, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(state)) !== null) {
      const h = parseInt(match.groups!.hour);
      const m = parseInt(match.groups!.minute);
      const s = parseInt(match.groups!.status);
      statusMap.set(`${h}:${m}`, PETKIT_STATUS_MAP[s] ?? EntryStatus.PENDING);
    }

    const schedules: Array<ScheduleEntry> = [];
    const items = day.items || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const timeSec = item.time ?? 0;
      const hour = Math.floor(timeSec / 3600);
      const minute = Math.floor((timeSec % 3600) / 60);
      const a1 = item.amount1 ?? 0;
      const a2 = item.amount2 ?? 0;

      schedules.push({
        id: i,
        hour,
        minute,
        amount: a1 + a2,
        amount1: a1,
        amount2: a2,
        status: statusMap.get(`${hour}:${minute}`) ?? EntryStatus.PENDING,
      });
    }

    return schedules.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }

  /**
   * Fallback: parse sensor state string (no per-hopper info).
   */
  private _parseFromState(state: string): Array<ScheduleEntry> {
    const schedules: Array<ScheduleEntry> = [];
    const regex = new RegExp(SCHEDULE_REGEX, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(state)) !== null) {
      schedules.push({
        id: parseInt(match.groups!.id),
        hour: parseInt(match.groups!.hour),
        minute: parseInt(match.groups!.minute),
        amount: parseInt(match.groups!.amount),
        status: PETKIT_STATUS_MAP[parseInt(match.groups!.status)] ?? EntryStatus.PENDING,
      });
    }
    return schedules.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }

  /**
   * Build the full feed_daily_list payload from the entity's attributes,
   * applying the mutation (add/edit entry) identified by the card.
   */
  handleSave(
    hass: any,
    _schedules: Array<ScheduleEntry>,
    entry: EditScheduleEntry,
    scheduleEntity: any,
  ): boolean {
    const rawSchedule = scheduleEntity?.attributes?.feed_daily_list;
    if (!rawSchedule || !Array.isArray(rawSchedule)) {
      console.error("[PetkitDevice] No feed_daily_list in entity attributes");
      return false;
    }

    // Deep clone to avoid mutating state
    const feedDailyList: Array<any> = JSON.parse(JSON.stringify(rawSchedule));

    const timeInSeconds = entry.hour * 3600 + entry.minute * 60;
    const a1 = entry.amount1 ?? Math.ceil(entry.amount / 2);
    const a2 = entry.amount2 ?? Math.floor(entry.amount / 2);

    if (entry.id === null) {
      // ADD: insert into every day's items (PetKit schedule repeats daily)
      for (const day of feedDailyList) {
        day.items.push({
          time: timeInSeconds,
          name: `Feed ${entry.hour}:${entry.minute.toString().padStart(2, "0")}`,
          amount: null,
          amount1: a1,
          amount2: a2,
          id: timeInSeconds,
        });
        day.count = day.items.length;
      }
    } else {
      // EDIT: find entry by its index (id) in each day and update
      for (const day of feedDailyList) {
        const item = day.items[entry.id];
        if (item) {
          item.time = timeInSeconds;
          item.id = timeInSeconds;
          item.name = `Feed ${entry.hour}:${entry.minute.toString().padStart(2, "0")}`;
          item.amount1 = a1;
          item.amount2 = a2;
          item.amount = null;
        }
      }
    }

    this._callSetSchedule(hass, feedDailyList);
    return true;
  }

  /**
   * Remove an entry from every day and call the bulk save.
   */
  handleRemove(
    hass: any,
    _schedules: Array<ScheduleEntry>,
    entry: EditScheduleEntry,
    scheduleEntity: any,
  ): boolean {
    if (entry.id === null) {
      return false;
    }

    const rawSchedule = scheduleEntity?.attributes?.feed_daily_list;
    if (!rawSchedule || !Array.isArray(rawSchedule)) {
      console.error("[PetkitDevice] No feed_daily_list in entity attributes");
      return false;
    }

    const feedDailyList: Array<any> = JSON.parse(JSON.stringify(rawSchedule));

    for (const day of feedDailyList) {
      if (entry.id < day.items.length) {
        day.items.splice(entry.id, 1);
        day.count = day.items.length;
      }
    }

    this._callSetSchedule(hass, feedDailyList);
    return true;
  }

  /**
   * Call petkit.set_feeding_schedule with the full schedule payload.
   */
  private _callSetSchedule(hass: any, feedDailyList: Array<any>): void {
    const serviceData = {
      device_id: this.deviceId,
      feed_daily_list: feedDailyList.map((day: any) => ({
        repeats: day.repeats,
        suspended: day.suspended ?? 0,
        items: day.items.map((item: any) => ({
          time: item.time,
          name: item.name,
          amount: item.amount ?? 0,
          amount1: item.amount1 ?? 0,
          amount2: item.amount2 ?? 0,
        })),
      })),
    };

    hass.callService("petkit", "set_feeding_schedule", serviceData);
  }
}
