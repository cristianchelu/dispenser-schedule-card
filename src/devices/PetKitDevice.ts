import {
  EntryStatus,
  NativeStatusDisplay,
  ScheduleEntry,
} from "../types/common";
import { ALL_WEEKDAYS, sortWeekdays, Weekday } from "../types/weekday";
import localize from "../localization";
import OpenPetBowlDevice, {
  type OpenPetBowlDeviceConfig,
} from "./OpenPetBowlDevice";

const PETKIT_DOMAIN = "petkit";
const STATE_TOKEN_RE = /(\d+),(\d{1,2}),(\d{1,2}),(\d+),(\d+)(?:,|$)/g;

export interface PetKitDeviceConfig extends OpenPetBowlDeviceConfig {
  type: "petkit";
}

interface PetkitFeedItem {
  time?: number | null;
  name?: string | null;
  amount?: number | null;
  amount1?: number | null;
  amount2?: number | null;
  id?: string | number | null;
}

interface PetkitFeedDay {
  repeats?: number | string | null;
  items?: PetkitFeedItem[] | null;
}

const PETKIT_NATIVE_ICONS: Record<string, string> = {
  dispensed_schedule: "mdi:clock-check-outline",
  dispensed_remote: "mdi:cellphone-check",
  dispensed_local: "mdi:account-check",
  cancelled: "mdi:debug-step-over",
  surplus_skipped: "mdi:food-off",
  error: "mdi:alert-circle-outline",
  past_unknown: "mdi:help-circle-outline",
};

function coerceInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const p = parseInt(v, 10);
    if (Number.isFinite(p)) return p;
  }
  return fallback;
}

function timeToSec(hour: number, minute: number): number {
  return hour * 3600 + minute * 60;
}

function secToHourMinute(t: number): { hour: number; minute: number } {
  return { hour: Math.floor(t / 3600), minute: Math.floor((t % 3600) / 60) };
}

function parseRepeatsToWeekday(repeats: number | string | null | undefined): Weekday {
  const n = typeof repeats === "string" ? parseInt(repeats, 10) : Number(repeats);
  if (n >= Weekday.Monday && n <= Weekday.Sunday) return n as Weekday;
  return Weekday.Monday;
}

function itemValues(item: PetkitFeedItem, dual: boolean): number[] {
  if (dual) return [coerceInt(item.amount1, 0), coerceInt(item.amount2, 0)];
  return [coerceInt(item.amount, 0)];
}

function isDualFromItems(items: PetkitFeedItem[]): boolean {
  return items.some(
    (it) =>
      (it.amount1 != null && it.amount1 !== 0) ||
      (it.amount2 != null && it.amount2 !== 0)
  );
}

function parseStateStatusByTime(state: string | undefined): Map<number, number> {
  const map = new Map<number, number>();
  if (!state) return map;
  const re = new RegExp(STATE_TOKEN_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(state)) !== null) {
    map.set(timeToSec(parseInt(m[2] ?? "0", 10), parseInt(m[3] ?? "0", 10)), parseInt(m[5] ?? "0", 10));
  }
  return map;
}

function statusCodeToEntryStatus(code: number): {
  status: EntryStatus;
  nativeKey?: string;
} {
  switch (code) {
    case 0:
      return { status: EntryStatus.PENDING };
    case 1:
      return { status: EntryStatus.DISPENSED, nativeKey: "dispensed_schedule" };
    case 2:
      return { status: EntryStatus.DISPENSED, nativeKey: "dispensed_remote" };
    case 3:
      return { status: EntryStatus.DISPENSED, nativeKey: "dispensed_local" };
    case 6:
      return { status: EntryStatus.UNKNOWN, nativeKey: "past_unknown" };
    case 7:
      return { status: EntryStatus.SKIPPED, nativeKey: "cancelled" };
    case 8:
      return { status: EntryStatus.SKIPPED, nativeKey: "surplus_skipped" };
    case 9:
      return { status: EntryStatus.FAILED, nativeKey: "error" };
    default:
      return { status: EntryStatus.PENDING };
  }
}

function feedDaysToSchedule(
  days: PetkitFeedDay[],
  stateStr: string | undefined,
  dual: boolean
): ScheduleEntry[] {
  type Group = {
    timeSec: number;
    name: string;
    values: number[];
    weekdays: Set<Weekday>;
    key: string;
  };
  const groups = new Map<string, Group>();
  const statusByTime = parseStateStatusByTime(stateStr);
  for (const d of days) {
    const wd = parseRepeatsToWeekday(d.repeats);
    for (const it of d.items ?? []) {
      const t = coerceInt(it.time, 0);
      if (t < 0) continue;
      const { hour, minute } = secToHourMinute(t);
      const name = it.name?.trim() ? it.name : `Feed ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const values = itemValues(it, dual);
      const key = it.id != null ? String(it.id) : `${t}::${name}::${values.join("×")}`;
      let g = groups.get(key);
      if (!g) {
        g = { timeSec: t, name, values, weekdays: new Set(), key };
        groups.set(key, g);
      }
      g.weekdays.add(wd);
    }
  }
  const result: ScheduleEntry[] = [];
  for (const g of groups.values()) {
    const { hour, minute } = secToHourMinute(g.timeSec);
    const code = statusByTime.get(g.timeSec) ?? 0;
    const { status, nativeKey } = statusCodeToEntryStatus(code);
    const wds = sortWeekdays([...g.weekdays]);
    result.push({
      key: g.key,
      hour,
      minute,
      values: g.values,
      label: /^Feed \d{2}:\d{2}$/.test(g.name) ? "" : g.name,
      status,
      weekdays: wds.length === ALL_WEEKDAYS.length ? undefined : wds,
    });
    if (nativeKey) {
      // filled by class after map
      (result[result.length - 1] as ScheduleEntry & { _native?: string })._native =
        nativeKey;
    }
  }
  return result.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}

/**
 * PetKit skin over OpenPetBowl: native status catalog + feed_daily_list fallback.
 */
export default class PetKitDevice extends OpenPetBowlDevice<PetKitDeviceConfig> {
  getNativeStatusDisplay(entry: ScheduleEntry): NativeStatusDisplay | undefined {
    const fromRow = this.nativeStatusByKey.get(entry.key);
    const k = fromRow ?? (entry as ScheduleEntry & { _native?: string })._native;
    if (!k) return undefined;
    const label = localize(`status_petkit.${k}`) ?? k;
    const icon = PETKIT_NATIVE_ICONS[k];
    return { key: k, label, ...(icon ? { icon } : {}) };
  }

  protected getScheduleFromFeedDailyListFallback(): ScheduleEntry[] {
    const list = this.attrs.feed_daily_list;
    if (!Array.isArray(list) || !list.length) return [];
    const days = list as PetkitFeedDay[];
    const allItems: PetkitFeedItem[] = [];
    for (const d of days) for (const it of d.items ?? []) allItems.push(it);
    const dual = isDualFromItems(allItems) || (this.bowlCapabilities?.compartments ?? 1) > 1;
    const entityId = this.resolved.scheduleEntity;
    const stateStr = entityId ? this.hass.states[entityId]?.state : undefined;
    const rows = feedDaysToSchedule(days, typeof stateStr === "string" ? stateStr : undefined, dual);
    this.nativeStatusByKey.clear();
    for (const row of rows) {
      const native = (row as ScheduleEntry & { _native?: string })._native;
      if (native) this.nativeStatusByKey.set(row.key, native);
    }
    return rows;
  }

  protected async writeFullSchedule(entries: ScheduleEntry[]): Promise<void> {
    if (this.bowlCapabilities?.actions?.set) {
      await super.writeFullSchedule(entries);
      return;
    }
    const id = this.resolved.cloudDeviceId;
    if (id == null) return;
    await this.hass.callService(PETKIT_DOMAIN, "set_feeding_schedule", {
      device_id: id,
      schedule: entries.map((e) => ({
        key: e.key,
        hour: e.hour,
        minute: e.minute,
        values: [...e.values],
        weekdays: e.weekdays,
        label: e.label,
      })),
    });
  }
}
