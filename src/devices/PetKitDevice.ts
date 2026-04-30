import {
  AmountConfig,
  Device,
  DeviceCapabilities,
  DeviceConfigError,
  DeviceDisplayInfo,
  EditScheduleEntry,
  EntryFieldDescriptor,
  EntryFieldRole,
  EntryStatus,
  GlobalToggleInfo,
  NativeStatusDisplay,
  ScheduleEntry,
} from "../types/common";
import { HomeAssistant } from "../types/ha";
import { ALL_WEEKDAYS, sortWeekdays, Weekday } from "../types/weekday";
import {
  canonicalizeWeekdays,
  type WeekdayPolicy,
} from "../types/scheduleWeekdays";
import localize from "../localization";

const PETKIT_DOMAIN = "petkit";
const MAX_ENTRIES = 10;

const STATE_TOKEN_RE = /(\d+),(\d{1,2}),(\d{1,2}),(\d+),(\d+)(?:,|$)/g;

/** Single feed plan row: index,hour,minute,amount,status (first day; status from device records). */
export interface PetKitDeviceConfig {
  type: "petkit";
  /** Home Assistant `device` registry id (trailing part of the device url). */
  device_id?: string;
  /** Override: entity id of the `raw_distribution_data` schedule sensor. */
  entity?: string;
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
  suspended?: number | null;
  count?: number | null;
  items?: PetkitFeedItem[] | null;
}

const WEEKDAY_POLICY: WeekdayPolicy = { allowNever: false };

function defaultFeedName(hour: number, minute: number): string {
  return `Feed ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToSec(hour: number, minute: number): number {
  return hour * 3600 + minute * 60;
}

function secToHourMinute(t: number): { hour: number; minute: number } {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return { hour: h, minute: m };
}

function parseRepeatsToWeekday(
  repeats: number | string | null | undefined
): Weekday {
  const n =
    typeof repeats === "string" ? parseInt(repeats, 10) : Number(repeats);
  if (n >= Weekday.Monday && n <= Weekday.Sunday) {
    return n as Weekday;
  }
  return Weekday.Monday;
}

function coerceInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const p = parseInt(v, 10);
    if (Number.isFinite(p)) return p;
  }
  return fallback;
}

function isFeedDailyList(
  v: unknown
): v is { device_id?: unknown; feed_daily_list: PetkitFeedDay[] } {
  if (!v || typeof v !== "object") return false;
  const rec = v as { feed_daily_list?: unknown };
  return Array.isArray(rec.feed_daily_list);
}

/**
 * Opaque per-row key: time + name + values so the same second-of-day with different
 * labels/amounts (rare) does not collide.
 */
function makePetKitEntryKey(
  timeSec: number,
  name: string,
  values: number[]
): string {
  return `${timeSec}::${name.trim()}::${values.join("×")}`;
}

function parseStateStatusByTime(
  state: string | undefined
): Map<number, number> {
  const map = new Map<number, number>();
  if (!state || typeof state !== "string") return map;
  const re = new RegExp(STATE_TOKEN_RE);
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(state)) !== null) {
    const hour = parseInt(m[2] ?? "0", 10);
    const minute = parseInt(m[3] ?? "0", 10);
    const status = parseInt(m[5] ?? "0", 10);
    const t = timeToSec(hour, minute);
    map.set(t, status);
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
      return { status: EntryStatus.UNKNOWN };
    case 7:
      return { status: EntryStatus.SKIPPED, nativeKey: "cancelled" };
    case 8:
      return {
        status: EntryStatus.SKIPPED,
        nativeKey: "skipped_surpluscontrol",
      };
    case 9:
      return { status: EntryStatus.FAILED };
    default:
      return { status: EntryStatus.PENDING };
  }
}

/** Code-level defaults for `nativeKey` (codes 1–2–3; matches historical custom `status_map` icons). */
const PETKIT_NATIVE_ICONS = {
  dispensed_schedule: "mdi:clock-check-outline",
  dispensed_remote: "mdi:cellphone-check",
  dispensed_local: "mdi:account-check",
} as const satisfies Record<string, string>;

function petkitNativeDefaultIcon(k: string): string | undefined {
  return (PETKIT_NATIVE_ICONS as Record<string, string>)[k];
}

function itemValues(item: PetkitFeedItem, dual: boolean): number[] {
  if (dual) {
    return [coerceInt(item.amount1, 0), coerceInt(item.amount2, 0)];
  }
  return [coerceInt(item.amount, 0)];
}

function isDualFromItems(items: PetkitFeedItem[]): boolean {
  for (const it of items) {
    const a1 = it.amount1;
    const a2 = it.amount2;
    if (a1 != null && a2 != null) return true;
    if ((a1 != null && a1 !== 0) || (a2 != null && a2 !== 0)) {
      return true;
    }
  }
  return false;
}

/** D4S / D4SH: dual hopper. Empty schedule: infer from HA device model. */
function isDualFromDeviceModel(
  hass: HomeAssistant,
  deviceId: string | undefined
): boolean {
  if (!deviceId) return false;
  const m = hass.devices?.[deviceId]?.model_id?.toLowerCase() ?? "";
  return m === "d4s" || m === "d4sh";
}

function findPetkitScheduleEntity(
  hass: HomeAssistant,
  deviceId: string
): string | undefined {
  const entities = hass.entities;
  if (!entities) return undefined;
  for (const entityId in entities) {
    const entity = entities[entityId];
    if (!entity) continue;
    if (entity.device_id !== deviceId) continue;
    const state = hass.states[entityId];
    if (!state) continue;
    const attrs = state.attributes;
    if (
      attrs &&
      Array.isArray((attrs as { feed_daily_list?: unknown }).feed_daily_list)
    ) {
      return entityId;
    }
  }
  return undefined;
}

interface ResolvedConfig {
  scheduleEntity: string | null;
  petkitDeviceId: number | null;
  errors: DeviceConfigError[];
}

function resolveConfig(
  config: PetKitDeviceConfig,
  hass: HomeAssistant
): ResolvedConfig {
  const errors: DeviceConfigError[] = [];
  let scheduleEntity = config.entity;
  if (!scheduleEntity && config.device_id) {
    scheduleEntity = findPetkitScheduleEntity(hass, config.device_id);
  }
  if (!scheduleEntity) {
    errors.push({ field: "device.entity" });
  }

  let petkitDeviceId: number | null = null;
  if (scheduleEntity) {
    const st = hass.states[scheduleEntity];
    const raw = st?.attributes?.device_id;
    if (raw != null) {
      const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
      if (Number.isFinite(n)) petkitDeviceId = n;
    }
  }
  if (config.device_id && scheduleEntity && !petkitDeviceId) {
    errors.push({ field: "device" });
  }

  return { scheduleEntity: scheduleEntity ?? null, petkitDeviceId, errors };
}

/**
 * Read full `feed_daily_list` from the schedule sensor, sorted by `repeats` (1–7).
 */
function getFeedDays(hass: HomeAssistant, entityId: string): PetkitFeedDay[] {
  const st = hass.states[entityId];
  const list = (
    st?.attributes as { feed_daily_list?: PetkitFeedDay[] } | undefined
  )?.feed_daily_list;
  if (!list?.length) return [];
  return [...list].sort(
    (a, b) =>
      parseRepeatsToWeekday(a.repeats) - parseRepeatsToWeekday(b.repeats)
  );
}

function emptySevenDays(
  previous: PetkitFeedDay[] | undefined
): PetkitFeedDay[] {
  const byWd = new Map<Weekday, PetkitFeedDay>();
  for (const d of previous ?? []) {
    byWd.set(parseRepeatsToWeekday(d.repeats), d);
  }
  const out: PetkitFeedDay[] = [];
  for (const wd of ALL_WEEKDAYS) {
    const prev = byWd.get(wd);
    out.push({
      repeats: wd,
      suspended: prev?.suspended != null ? coerceInt(prev.suspended, 0) : 0,
      count: 0,
      items: [],
    });
  }
  return out;
}

/**
 * Rebuilds the 7-day `feed_daily_list` from logical schedule entries (same shape as
 * the card) + dual/single + suspended preservation.
 */
function scheduleEntriesToFeedDays(
  entries: readonly ScheduleEntry[],
  dual: boolean,
  previous: PetkitFeedDay[]
): PetkitFeedDay[] {
  const days = emptySevenDays(previous);

  for (const e of entries) {
    const t = timeToSec(e.hour, e.minute);
    const name =
      (e.label?.trim() ? e.label : defaultFeedName(e.hour, e.minute)) ??
      defaultFeedName(e.hour, e.minute);
    const wds = canonicalizeWeekdays(e.weekdays, WEEKDAY_POLICY);
    const targetDays =
      wds === undefined
        ? [...ALL_WEEKDAYS]
        : wds.length > 0
          ? wds
          : [...ALL_WEEKDAYS];
    for (const wd of targetDays) {
      const day = days[wd - 1];
      if (!day) continue;
      const item: PetkitFeedItem = {
        time: t,
        name,
      };
      if (dual) {
        item.amount1 = e.values[0] ?? 0;
        item.amount2 = e.values[1] ?? 0;
        item.amount = 0;
      } else {
        item.amount = e.values[0] ?? 0;
        item.amount1 = 0;
        item.amount2 = 0;
      }
      (day.items = day.items ?? []).push(item);
    }
  }
  for (const d of days) {
    const items = d.items ?? [];
    items.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    d.items = items;
    d.count = items.length;
  }
  return days;
}

/**
 * Merges per-day `feed_daily_list` into logical `ScheduleEntry` rows, grouping by
 * `(time, name, value signature)` across days.
 */
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
  };
  const groups = new Map<string, Group>();
  const statusByTime = parseStateStatusByTime(stateStr);

  for (const d of days) {
    const wd = parseRepeatsToWeekday(d.repeats);
    for (const it of d.items ?? []) {
      const t = coerceInt(it.time, 0);
      if (t < 0) continue;
      const name = (
        it.name?.trim()
          ? it.name
          : defaultFeedName(secToHourMinute(t).hour, secToHourMinute(t).minute)
      ) as string;
      const values = itemValues(it, dual);
      const gk = makePetKitEntryKey(t, name, values);
      let g = groups.get(gk);
      if (!g) {
        g = { timeSec: t, name, values, weekdays: new Set<Weekday>() };
        groups.set(gk, g);
      }
      g.weekdays.add(wd);
    }
  }

  const result: ScheduleEntry[] = [];
  for (const g of groups.values()) {
    const { hour, minute } = secToHourMinute(g.timeSec);
    const code = statusByTime.get(g.timeSec) ?? 0;
    const { status } = statusCodeToEntryStatus(code);
    const wds = sortWeekdays([...g.weekdays]);
    const allSeven = wds.length === ALL_WEEKDAYS.length;
    const isDefaultName =
      g.name.startsWith("Feed ") && /^Feed \d{2}:\d{2}$/.test(g.name);
    const entry: ScheduleEntry = {
      key: makePetKitEntryKey(g.timeSec, g.name, g.values),
      hour,
      minute,
      values: g.values,
      label: isDefaultName ? "" : (g.name ?? ""),
      status,
      weekdays: allSeven ? undefined : wds,
    };
    result.push(entry);
  }
  return result.sort(
    (a, b) =>
      a.hour - b.hour || a.minute - b.minute || a.key.localeCompare(b.key)
  );
}

export default class PetKitDevice extends Device<PetKitDeviceConfig> {
  private resolved: ResolvedConfig;

  constructor(deviceConfig: PetKitDeviceConfig, hass: HomeAssistant) {
    super(deviceConfig, hass);
    this.resolved = resolveConfig(deviceConfig, hass);
  }

  updateHass(hass: HomeAssistant): void {
    super.updateHass(hass);
    this.resolved = resolveConfig(this.deviceConfig, hass);
  }

  get capabilities(): DeviceCapabilities {
    const hasDeviceId = !!this.deviceConfig.device_id;
    return {
      hasEntryToggle: false,
      hasGlobalToggle: false,
      canAddEntries: hasDeviceId,
      canRemoveEntries: hasDeviceId,
      canEditEntries: hasDeviceId,
      maxEntries: MAX_ENTRIES,
      weeklySchedule: { allowNever: false },
      hasTodaySkip: false,
      hasEntryLabel: hasDeviceId
        ? {
            required: false,
            minLength: 0,
            maxLength: 50,
            pattern: ".*",
          }
        : false,
      callSound: false,
    };
  }

  get entryFields(): EntryFieldDescriptor[] {
    const entityId = this.resolved.scheduleEntity;
    if (!entityId) {
      return [
        { role: EntryFieldRole.QUANTITY, config: { min: 1, max: 50, step: 1 } },
      ];
    }
    const days = getFeedDays(this.hass, entityId);
    const allItems: PetkitFeedItem[] = [];
    for (const d of days) {
      for (const it of d.items ?? []) allItems.push(it);
    }
    const dual =
      isDualFromItems(allItems) ||
      isDualFromDeviceModel(this.hass, this.deviceConfig.device_id);
    const min = dual ? 0 : 1;
    const max = dual ? 10 : 50;
    const configAmt: AmountConfig = { min, max, step: 1 };
    if (dual) {
      return [
        {
          role: EntryFieldRole.QUANTITY,
          config: configAmt,
          compartmentColor: "blue",
        },
        {
          role: EntryFieldRole.QUANTITY,
          config: configAmt,
          compartmentColor: "orange",
        },
      ];
    }
    return [{ role: EntryFieldRole.QUANTITY, config: configAmt }];
  }

  getWatchedEntities(): string[] {
    const e: string[] = [];
    if (this.resolved.scheduleEntity) e.push(this.resolved.scheduleEntity);
    return e;
  }

  getConfigErrors(): DeviceConfigError[] {
    return this.resolved.errors;
  }

  getDisplayInfo(): DeviceDisplayInfo {
    const id = this.resolved.scheduleEntity;
    if (!id) return {};
    const st = this.hass.states[id];
    return {
      name: st?.attributes.friendly_name,
      icon: st?.attributes.icon,
    };
  }

  isAvailable(): boolean {
    const id = this.resolved.scheduleEntity;
    if (!id) return false;
    const st = this.hass.states[id];
    return !!st && st.state !== "unavailable";
  }

  getSchedule(): ScheduleEntry[] {
    const entityId = this.resolved.scheduleEntity;
    if (!entityId) return [];
    const st = this.hass.states[entityId];
    if (!st) return [];
    if (!isFeedDailyList(st.attributes)) return [];
    const days = st.attributes.feed_daily_list;
    const allItems: PetkitFeedItem[] = [];
    for (const d of days) {
      for (const it of d.items ?? []) allItems.push(it);
    }
    const dual =
      isDualFromItems(allItems) ||
      isDualFromDeviceModel(this.hass, this.deviceConfig.device_id);
    return feedDaysToSchedule(days, st.state, dual);
  }

  getGlobalToggle(): GlobalToggleInfo | null {
    return null;
  }

  getDisplayStatus(entry: ScheduleEntry): EntryStatus {
    return entry.status;
  }

  getNativeStatusDisplay(
    entry: ScheduleEntry
  ): NativeStatusDisplay | undefined {
    const entityId = this.resolved.scheduleEntity;
    if (!entityId) return undefined;
    const st = this.hass.states[entityId];
    const timeSec = timeToSec(entry.hour, entry.minute);
    const code = parseStateStatusByTime(
      typeof st?.state === "string" ? st.state : undefined
    ).get(timeSec);
    if (code === undefined) {
      return undefined;
    }
    const { nativeKey: k } = statusCodeToEntryStatus(code);
    if (k) {
      const defLabel = localize(`status_petkit.${k}`) ?? k;
      const icon = petkitNativeDefaultIcon(k);
      return {
        key: k,
        label: defLabel,
        ...(icon ? { icon } : {}),
      };
    }
    return undefined;
  }

  private async writeScheduleFromEntries(next: ScheduleEntry[]): Promise<void> {
    const id = this.resolved.petkitDeviceId;
    const entityId = this.resolved.scheduleEntity;
    if (id == null || !entityId) return;
    if (next.length > MAX_ENTRIES) return;
    const previous = getFeedDays(this.hass, entityId);
    const allItems: PetkitFeedItem[] = [];
    for (const d of previous) for (const it of d.items ?? []) allItems.push(it);
    const dual =
      isDualFromItems(allItems) ||
      isDualFromDeviceModel(this.hass, this.deviceConfig.device_id) ||
      next.some((e) => e.values.length > 1);
    const feedDays = scheduleEntriesToFeedDays(next, dual, previous);

    const payload = {
      device_id: id,
      feed_daily_list: feedDays.map((day) => ({
        repeats: coerceInt(day.repeats, 1),
        suspended: day.suspended != null ? coerceInt(day.suspended, 0) : 0,
        items: (day.items ?? []).map((it) => {
          const t = coerceInt(it.time, 0);
          const n =
            (it.name?.trim()
              ? it.name
              : defaultFeedName(
                  secToHourMinute(t).hour,
                  secToHourMinute(t).minute
                )) ?? defaultFeedName(0, 0);
          if (dual) {
            return {
              time: t,
              name: n,
              amount1: coerceInt(it.amount1, 0),
              amount2: coerceInt(it.amount2, 0),
            };
          }
          return {
            time: t,
            name: n,
            amount: coerceInt(it.amount, 0),
          };
        }),
      })),
    };

    await this.hass.callService(PETKIT_DOMAIN, "set_feeding_schedule", payload);
  }

  private toScheduleFromEdit(e: EditScheduleEntry): ScheduleEntry {
    const name =
      (e.label?.trim() ? e.label : defaultFeedName(e.hour, e.minute)) ?? "";
    const values = e.values;
    const t = timeToSec(e.hour, e.minute);
    const wds = canonicalizeWeekdays(e.weekdays, WEEKDAY_POLICY);
    const key = makePetKitEntryKey(
      t,
      name || defaultFeedName(e.hour, e.minute),
      values
    );
    return {
      key,
      hour: e.hour,
      minute: e.minute,
      values: [...values],
      label: e.label?.trim() ? e.label : "",
      status: EntryStatus.PENDING,
      weekdays: wds,
    };
  }

  async addEntry(entry: EditScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    const current = this.getSchedule();
    if (current.length >= MAX_ENTRIES) return;
    const newRow = this.toScheduleFromEdit(entry);
    await this.writeScheduleFromEntries([...current, newRow]);
  }

  async editEntry(entry: EditScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id || entry.key === null) return;
    const current = this.getSchedule();
    const others = current.filter((s) => s.key !== entry.key);
    const updated = this.toScheduleFromEdit({ ...entry, key: entry.key });
    if (others.length + 1 > MAX_ENTRIES) return;
    await this.writeScheduleFromEntries([...others, updated]);
  }

  async removeEntry(entry: ScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    const current = this.getSchedule();
    await this.writeScheduleFromEntries(
      current.filter((s) => s.key !== entry.key)
    );
  }

  async toggleEntry(_entry: ScheduleEntry): Promise<void> {
    return Promise.resolve();
  }

  async setGlobalToggle(_enabled: boolean): Promise<void> {
    return Promise.resolve();
  }

  getNewEntryDefaults(): EditScheduleEntry {
    const fields = this.entryFields;
    const values = fields.length > 1 ? [1, 0] : [fields[0]?.config.min ?? 1];
    return {
      key: null,
      hour: 0,
      minute: 0,
      values,
      label: "",
      weekdays: undefined,
    };
  }
}
