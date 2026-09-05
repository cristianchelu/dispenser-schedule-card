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
  isEntryStatus,
} from "../types/common";
import { HomeAssistant } from "../types/ha";
import { ALL_WEEKDAYS, sortWeekdays, Weekday } from "../types/weekday";

const DOMAIN_PRIORITY: Record<string, number> = {
  switch: 0,
  binary_sensor: 1,
  sensor: 2,
};

export interface OpenPetBowlDeviceConfig {
  type: string;
  /** Home Assistant device registry id. */
  device_id?: string;
  /** Override schedule entity when discovery is ambiguous. */
  entity?: string;
}

export interface OpenPetBowlAmount {
  min: number;
  max: number;
  step: number;
}

export interface OpenPetBowlActions {
  set?: string;
  add?: string;
  edit?: string;
  remove?: string;
  skip_today?: string;
  unskip_today?: string;
}

export interface OpenPetBowlCapabilities {
  compartments: number;
  amount: OpenPetBowlAmount;
  weekly?: boolean;
  today_skip?: boolean;
  global_toggle?: boolean;
  labels?: boolean;
  actions?: OpenPetBowlActions;
}

export interface OpenPetBowlRow {
  key: string;
  hour: number;
  minute: number;
  values: number[];
  weekdays?: number[];
  label?: string;
  status?: string;
  native_status?: string | null;
  enabled?: boolean;
  today?: boolean;
  readonly?: boolean;
}

function coerceInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const p = parseInt(v, 10);
    if (Number.isFinite(p)) return p;
  }
  return fallback;
}

function isAmountShape(v: unknown): v is OpenPetBowlAmount {
  if (!v || typeof v !== "object") return false;
  const rec = v as Record<string, unknown>;
  return (
    typeof rec.min === "number" &&
    typeof rec.max === "number" &&
    typeof rec.step === "number"
  );
}

export function isOpenPetBowlCapabilities(
  v: unknown
): v is OpenPetBowlCapabilities {
  if (!v || typeof v !== "object") return false;
  const rec = v as Record<string, unknown>;
  return (
    (rec.compartments === 1 || rec.compartments === 2) &&
    isAmountShape(rec.amount)
  );
}

function isOpenPetBowlAttrs(attrs: Record<string, unknown> | undefined): boolean {
  if (!attrs) return false;
  return isOpenPetBowlCapabilities(attrs.capabilities) && Array.isArray(attrs.schedule);
}

function domainOf(entityId: string): string {
  return entityId.split(".")[0] ?? "";
}

function parseService(qualified: string): { domain: string; service: string } | null {
  const dot = qualified.indexOf(".");
  if (dot <= 0) return null;
  return { domain: qualified.slice(0, dot), service: qualified.slice(dot + 1) };
}

function findOpenPetBowlEntity(
  hass: HomeAssistant,
  deviceId: string
): string | undefined {
  const entities = hass.entities;
  if (!entities) return undefined;
  const matches: { id: string; rank: number }[] = [];
  for (const entityId in entities) {
    const entity = entities[entityId];
    if (!entity || entity.device_id !== deviceId) continue;
    const state = hass.states[entityId];
    if (!isOpenPetBowlAttrs(state?.attributes)) continue;
    matches.push({
      id: entityId,
      rank: DOMAIN_PRIORITY[domainOf(entityId)] ?? 9,
    });
  }
  matches.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  return matches[0]?.id;
}

function findFeedDailyListEntity(
  hass: HomeAssistant,
  deviceId: string
): string | undefined {
  const entities = hass.entities;
  if (!entities) return undefined;
  for (const entityId in entities) {
    const entity = entities[entityId];
    if (!entity || entity.device_id !== deviceId) continue;
    const state = hass.states[entityId];
    if (Array.isArray(state?.attributes?.feed_daily_list)) return entityId;
  }
  return undefined;
}

function rowToSchedule(row: OpenPetBowlRow): ScheduleEntry {
  const status = isEntryStatus(row.status) ? row.status : EntryStatus.PENDING;
  const wds = Array.isArray(row.weekdays)
    ? sortWeekdays(row.weekdays.filter((n) => n >= 1 && n <= 7) as Weekday[])
    : undefined;
  return {
    key: String(row.key),
    hour: coerceInt(row.hour, 0),
    minute: coerceInt(row.minute, 0),
    values: Array.isArray(row.values) ? row.values.map((n) => coerceInt(n, 0)) : [0],
    label: row.label ?? "",
    status,
    weekdays: wds?.length === ALL_WEEKDAYS.length ? undefined : wds,
    readonly: !!row.readonly,
  };
}

interface ResolvedConfig {
  scheduleEntity: string | null;
  cloudDeviceId: number | null;
  openPetBowl: boolean;
  errors: DeviceConfigError[];
}

function resolveConfig(
  config: OpenPetBowlDeviceConfig,
  hass: HomeAssistant
): ResolvedConfig {
  const errors: DeviceConfigError[] = [];
  let scheduleEntity = config.entity;
  if (!scheduleEntity && config.device_id) {
    scheduleEntity =
      findOpenPetBowlEntity(hass, config.device_id) ??
      findFeedDailyListEntity(hass, config.device_id);
  }
  if (!scheduleEntity) {
    errors.push({ field: "device.entity" });
  }
  const st = scheduleEntity ? hass.states[scheduleEntity] : undefined;
  const openPetBowl = isOpenPetBowlAttrs(st?.attributes);
  let cloudDeviceId: number | null = null;
  const raw = st?.attributes?.device_id;
  if (raw != null) {
    const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (Number.isFinite(n)) cloudDeviceId = n;
  }
  if (config.device_id && scheduleEntity && !cloudDeviceId) {
    errors.push({ field: "device" });
  }
  return {
    scheduleEntity: scheduleEntity ?? null,
    cloudDeviceId,
    openPetBowl,
    errors,
  };
}

/**
 * Generic OpenPetBowl reader/writer. YAML is `device_id` (HA registry id).
 * Discovers the schedule entity by capabilities + `schedule[]`, with a
 * `feed_daily_list` fallback for mid-migration Home Assistant.
 */
export default class OpenPetBowlDevice<
  TConfig extends OpenPetBowlDeviceConfig = OpenPetBowlDeviceConfig,
> extends Device<TConfig> {
  protected resolved: ResolvedConfig;
  protected nativeStatusByKey = new Map<string, string>();

  constructor(deviceConfig: TConfig, hass: HomeAssistant) {
    super(deviceConfig, hass);
    this.resolved = resolveConfig(deviceConfig, hass);
  }

  updateHass(hass: HomeAssistant): void {
    super.updateHass(hass);
    this.resolved = resolveConfig(this.deviceConfig, hass);
  }

  protected get attrs(): Record<string, unknown> {
    const id = this.resolved.scheduleEntity;
    if (!id) return {};
    return (this.hass.states[id]?.attributes ?? {}) as Record<string, unknown>;
  }

  protected get bowlCapabilities(): OpenPetBowlCapabilities | null {
    const caps = this.attrs.capabilities;
    return isOpenPetBowlCapabilities(caps) ? caps : null;
  }

  get capabilities(): DeviceCapabilities {
    const caps = this.bowlCapabilities;
    const hasId = !!this.deviceConfig.device_id;
    const actions = caps?.actions ?? {};
    const canWrite = hasId && (!!actions.add || !!actions.set);
    return {
      hasEntryToggle: false,
      hasGlobalToggle: !!caps?.global_toggle,
      canAddEntries: canWrite,
      canRemoveEntries: hasId && (!!actions.remove || !!actions.set),
      canEditEntries: hasId && (!!actions.edit || !!actions.set),
      maxEntries: 10,
      weeklySchedule: caps?.weekly === false ? false : { allowNever: false },
      hasTodaySkip: !!caps?.today_skip,
      hasEntryLabel: caps?.labels
        ? { required: false, minLength: 0, maxLength: 50, pattern: ".*" }
        : false,
      callSound: false,
    };
  }

  get entryFields(): EntryFieldDescriptor[] {
    const caps = this.bowlCapabilities;
    const amount: AmountConfig = caps?.amount ?? { min: 1, max: 50, step: 1 };
    const n = caps?.compartments ?? 1;
    if (n >= 2) {
      return [
        { role: EntryFieldRole.QUANTITY, config: amount, compartmentColor: "blue" },
        { role: EntryFieldRole.QUANTITY, config: amount, compartmentColor: "orange" },
      ];
    }
    return [{ role: EntryFieldRole.QUANTITY, config: amount }];
  }

  getWatchedEntities(): string[] {
    return this.resolved.scheduleEntity ? [this.resolved.scheduleEntity] : [];
  }

  getConfigErrors(): DeviceConfigError[] {
    return this.resolved.errors;
  }

  getDisplayInfo(): DeviceDisplayInfo {
    const id = this.resolved.scheduleEntity;
    if (!id) return {};
    const st = this.hass.states[id];
    return { name: st?.attributes.friendly_name, icon: st?.attributes.icon };
  }

  isAvailable(): boolean {
    const id = this.resolved.scheduleEntity;
    if (!id) return false;
    const st = this.hass.states[id];
    return !!st && st.state !== "unavailable";
  }

  getSchedule(): ScheduleEntry[] {
    this.nativeStatusByKey.clear();
    const raw = this.attrs.schedule;
    if (Array.isArray(raw)) {
      return (raw as OpenPetBowlRow[]).map((row) => {
        if (row.native_status) {
          this.nativeStatusByKey.set(String(row.key), row.native_status);
        }
        return rowToSchedule(row);
      });
    }
    return this.getScheduleFromFeedDailyListFallback();
  }

  /** Mid-migration: old HA sensor with `feed_daily_list` only. */
  protected getScheduleFromFeedDailyListFallback(): ScheduleEntry[] {
    return [];
  }

  getGlobalToggle(): GlobalToggleInfo | null {
    if (!this.capabilities.hasGlobalToggle) return null;
    const id = this.resolved.scheduleEntity;
    if (!id) return null;
    const st = this.hass.states[id];
    if (!st) return null;
    const on = st.state === "on" || st.state === "true";
    return { state: on };
  }

  getDisplayStatus(entry: ScheduleEntry): EntryStatus {
    return entry.status;
  }

  canSkipEntryForToday(entry: ScheduleEntry): boolean {
    if (!this.capabilities.hasTodaySkip) return false;
    return entry.status === EntryStatus.PENDING && this.entryAppliesToday(entry);
  }

  canUnskipEntryForToday(entry: ScheduleEntry): boolean {
    if (!this.capabilities.hasTodaySkip) return false;
    return entry.status === EntryStatus.SKIPPED;
  }

  protected async callAction(
    qualified: string | undefined,
    data: Record<string, unknown>
  ): Promise<boolean> {
    if (!qualified) return false;
    const parsed = parseService(qualified);
    if (!parsed) return false;
    await this.hass.callService(parsed.domain, parsed.service, data);
    return true;
  }

  protected servicePayload(extra: Record<string, unknown>): Record<string, unknown> {
    return { device_id: this.resolved.cloudDeviceId, ...extra };
  }

  async addEntry(entry: EditScheduleEntry): Promise<void> {
    const actions = this.bowlCapabilities?.actions ?? {};
    const payload = this.servicePayload({
      hour: entry.hour,
      minute: entry.minute,
      values: [...entry.values],
      weekdays: entry.weekdays,
      label: entry.label,
    });
    if (await this.callAction(actions.add, payload)) return;
    const next = [...this.getSchedule(), this.toScheduleFromEdit(entry)];
    await this.writeFullSchedule(next);
  }

  async editEntry(entry: EditScheduleEntry): Promise<void> {
    if (entry.key === null) return;
    const actions = this.bowlCapabilities?.actions ?? {};
    const payload = this.servicePayload({
      key: entry.key,
      hour: entry.hour,
      minute: entry.minute,
      values: [...entry.values],
      weekdays: entry.weekdays,
      label: entry.label,
    });
    if (await this.callAction(actions.edit, payload)) return;
    const next = this.getSchedule().map((row) =>
      row.key === entry.key ? this.toScheduleFromEdit(entry) : row
    );
    await this.writeFullSchedule(next);
  }

  async removeEntry(entry: ScheduleEntry): Promise<void> {
    const actions = this.bowlCapabilities?.actions ?? {};
    if (await this.callAction(actions.remove, this.servicePayload({ key: entry.key }))) {
      return;
    }
    await this.writeFullSchedule(this.getSchedule().filter((s) => s.key !== entry.key));
  }

  async toggleEntry(_entry: ScheduleEntry): Promise<void> {
    return Promise.resolve();
  }

  async setGlobalToggle(enabled: boolean): Promise<void> {
    const id = this.resolved.scheduleEntity;
    if (!id || !this.capabilities.hasGlobalToggle) return;
    await this.hass.callService("switch", enabled ? "turn_on" : "turn_off", {
      entity_id: id,
    });
  }

  async setEntrySkipForToday(entry: ScheduleEntry, skip: boolean): Promise<void> {
    const actions = this.bowlCapabilities?.actions ?? {};
    const qualified = skip ? actions.skip_today : actions.unskip_today;
    await this.callAction(qualified, this.servicePayload({ key: entry.key }));
  }

  protected async writeFullSchedule(entries: ScheduleEntry[]): Promise<void> {
    const actions = this.bowlCapabilities?.actions ?? {};
    const schedule = entries.map((e) => ({
      key: e.key,
      hour: e.hour,
      minute: e.minute,
      values: [...e.values],
      weekdays: e.weekdays,
      label: e.label,
    }));
    if (await this.callAction(actions.set, this.servicePayload({ schedule }))) return;
  }

  protected toScheduleFromEdit(e: EditScheduleEntry): ScheduleEntry {
    return {
      key: e.key ?? `${e.hour}:${e.minute}`,
      hour: e.hour,
      minute: e.minute,
      values: [...e.values],
      label: e.label?.trim() ? e.label : "",
      status: EntryStatus.PENDING,
      weekdays: e.weekdays,
    };
  }

  getNewEntryDefaults(): EditScheduleEntry {
    const fields = this.entryFields;
    const values =
      fields.length > 1
        ? [fields[0]?.config.min ?? 1, 0]
        : [fields[0]?.config.min ?? 1];
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
