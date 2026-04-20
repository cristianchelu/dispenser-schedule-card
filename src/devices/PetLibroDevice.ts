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
  ScheduleEntry,
} from "../types/common";
import {
  HassEntityRegistryEntry,
  HomeAssistant,
  listEntityRegistryEntries,
} from "../types/ha";
import { canonicalizeWeekdays } from "../types/scheduleWeekdays";
import {
  ALL_WEEKDAYS,
  getTodayWeekday,
  sortWeekdays,
  Weekday,
} from "../types/weekday";

// --- PetLibro registry discovery (platform + device_id) ---

const PETLIBRO_PLATFORM = "petlibro";

function findPetlibroEntityByDevice(
  hass: HomeAssistant,
  deviceId: string,
  predicate: (entry: HassEntityRegistryEntry) => boolean
): HassEntityRegistryEntry | undefined {
  return listEntityRegistryEntries(hass).find(
    (entry) =>
      entry.platform === PETLIBRO_PLATFORM &&
      entry.device_id === deviceId &&
      predicate(entry)
  );
}

/** Full schedule `binary_sensor`: `attributes.schedule_type === "full"`. */
function findPetlibroScheduleEntity(
  hass: HomeAssistant,
  deviceId: string
): string | undefined {
  for (const entry of listEntityRegistryEntries(hass)) {
    if (
      entry.platform !== PETLIBRO_PLATFORM ||
      entry.device_id !== deviceId ||
      !entry.entity_id.startsWith("binary_sensor.")
    ) {
      continue;
    }
    const a = hass.states[entry.entity_id]?.attributes as
      | Record<string, unknown>
      | undefined;
    if (a?.schedule_type === "full") {
      return entry.entity_id;
    }
  }
  return undefined;
}

// --- Schedule attributes → card model; service payload helpers ---

/**
 * Plan `state` strings from the integration (values only; numeric codes are irrelevant).
 */
const PETLIBRO_STATE_TO_STATUS: Record<string, EntryStatus> = {
  pending: EntryStatus.PENDING,
  to_be_skipped: EntryStatus.SKIPPED,
  dispensed: EntryStatus.DISPENSED,
  skipped: EntryStatus.SKIPPED,
  state_5: EntryStatus.NONE,
  unknown: EntryStatus.NONE,
  not_for_today: EntryStatus.SKIPPED,
};

function parseTime(time: string | undefined): { hour: number; minute: number } {
  if (!time) return { hour: 0, minute: 0 };
  const [hStr, mStr] = time.split(":");
  const hour = parseInt(hStr ?? "", 10);
  const minute = parseInt(mStr ?? "", 10);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

/** Integration `repeat_days`: **1 = Monday … 7 = Sunday** (card `Weekday` enum). */
function repeatDaysToWeekdays(days: unknown): Weekday[] | null {
  if (!Array.isArray(days)) return null;
  const out: Weekday[] = [];
  for (const v of days) {
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 1 || n > 7) return null;
    out.push(n as Weekday);
  }
  if (out.length === 0) return null;
  return out;
}

function planEntryKey(
  plan: Record<string, unknown>,
  fallbackKey: string
): string | null {
  const pid = plan.planID ?? plan.plan_id ?? plan.id;
  if (typeof pid === "number" && Number.isFinite(pid)) return String(pid);
  if (typeof pid === "string" && pid.trim() !== "") return pid.trim();
  if (typeof plan.label === "string" && plan.label.length > 0) {
    return `label:${plan.label}`;
  }
  return fallbackKey || null;
}

function coerceNumericPlanId(plan: Record<string, unknown>): number | null {
  const pid = plan.planID ?? plan.plan_id ?? plan.id;
  if (typeof pid === "number" && Number.isFinite(pid)) return pid;
  if (typeof pid === "string") {
    const n = parseInt(pid.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function planToScheduleEntry(
  planRaw: Record<string, unknown>,
  fallbackKey: string,
  today: Weekday
): ScheduleEntry | null {
  const keyStr = planEntryKey(planRaw, fallbackKey);
  if (!keyStr) return null;
  if (
    coerceNumericPlanId(planRaw) === null &&
    planRaw.planID === undefined &&
    typeof planRaw.label !== "string"
  ) {
    return null;
  }

  const time = typeof planRaw.time === "string" ? planRaw.time : undefined;
  const { hour, minute } = parseTime(time);
  const amount =
    typeof planRaw.amount_raw === "number" ? planRaw.amount_raw : 0;
  const enabled = planRaw.enabled !== false;
  const execState =
    typeof planRaw.state === "string" && planRaw.state.trim() !== ""
      ? planRaw.state.trim()
      : typeof planRaw.feed_state === "string" &&
          planRaw.feed_state.trim() !== ""
        ? planRaw.feed_state.trim()
        : undefined;
  const baseStatus =
    execState === undefined
      ? EntryStatus.PENDING
      : (PETLIBRO_STATE_TO_STATUS[execState] ?? EntryStatus.PENDING);
  const status = enabled ? baseStatus : EntryStatus.DISABLED;

  const repeatDays = repeatDaysToWeekdays(planRaw.repeat_days);
  if (repeatDays === null) {
    if (execState && execState !== "not_for_today") {
      return {
        key: keyStr,
        hour,
        minute,
        values: [amount],
        status,
        weekdays: [today],
        readonly: true,
      };
    }
    return null;
  }

  const uniqueSorted = sortWeekdays([...new Set(repeatDays)]);
  const isAllDays = uniqueSorted.length === ALL_WEEKDAYS.length;
  const weekdays = isAllDays ? undefined : canonicalizeWeekdays(uniqueSorted);

  return {
    key: keyStr,
    hour,
    minute,
    values: [amount],
    status,
    weekdays,
  };
}

/**
 * Reads only `attributes.schedule`: array of plans, or a single object map
 * normalized with `Object.values` (prefer array from the integration).
 */
function parseScheduleAttributes(
  attrs: Record<string, unknown>,
  today: Weekday
): ScheduleEntry[] {
  const raw = attrs.schedule;
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    items = Object.values(raw as Record<string, unknown>);
  } else {
    return [];
  }

  const entries: ScheduleEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = planToScheduleEntry(
      item as Record<string, unknown>,
      `idx:${i}`,
      today
    );
    if (row) entries.push(row);
  }
  return entries.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}

// --- Device ---

export type PetLibroGlobalToggleConfig =
  | string
  | {
      state_entity: string;
      on_button: string;
      off_button: string;
    };

export interface PetLibroDeviceConfig {
  type: "petlibro";
  device_id?: string;
  entity?: string;
  switch?: PetLibroGlobalToggleConfig;
}

interface GlobalToggleAdapter {
  watchedEntities: string[];
  getState(hass: HomeAssistant): boolean | null;
  turnOn(hass: HomeAssistant): Promise<void>;
  turnOff(hass: HomeAssistant): Promise<void>;
}

function buildSwitchAdapter(entityId: string): GlobalToggleAdapter {
  const [domain] = entityId.split(".");
  const callDomain = domain === "switch" ? "switch" : "homeassistant";
  return {
    watchedEntities: [entityId],
    getState: (hass) => {
      const state = hass.states[entityId]?.state;
      if (state === "on") return true;
      if (state === "off") return false;
      return null;
    },
    turnOn: (hass) =>
      hass.callService(callDomain, "turn_on", { entity_id: entityId }),
    turnOff: (hass) =>
      hass.callService(callDomain, "turn_off", { entity_id: entityId }),
  };
}

function buildCompoundAdapter(
  stateEntity: string,
  onButton: string,
  offButton: string
): GlobalToggleAdapter {
  return {
    watchedEntities: [stateEntity, onButton, offButton],
    getState: (hass) => {
      const state = hass.states[stateEntity]?.state;
      if (state === "on") return true;
      if (state === "off") return false;
      return null;
    },
    turnOn: (hass) =>
      hass.callService("button", "press", { entity_id: onButton }),
    turnOff: (hass) =>
      hass.callService("button", "press", { entity_id: offButton }),
  };
}

/**
 * Whole-schedule on/off: read `on`/`off` from the schedule `binary_sensor`,
 * write via `petlibro.toggle_feeding_schedule` (integration refreshes state).
 */
function buildPetlibroScheduleToggleAdapter(
  deviceId: string,
  scheduleEntityId: string
): GlobalToggleAdapter {
  return {
    watchedEntities: [scheduleEntityId],
    getState: (hass) => {
      const state = hass.states[scheduleEntityId]?.state;
      if (state === "on") return true;
      if (state === "off") return false;
      return null;
    },
    turnOn: (hass) =>
      hass.callService("petlibro", "toggle_feeding_schedule", {
        device_id: deviceId,
        enable: true,
      }),
    turnOff: (hass) =>
      hass.callService("petlibro", "toggle_feeding_schedule", {
        device_id: deviceId,
        enable: false,
      }),
  };
}

interface ResolvedConfig {
  scheduleEntity: string | null;
  toggle: GlobalToggleAdapter | null;
  errors: DeviceConfigError[];
}

function resolveConfig(
  config: PetLibroDeviceConfig,
  hass: HomeAssistant
): ResolvedConfig {
  const errors: DeviceConfigError[] = [];

  let scheduleEntity = config.entity ?? null;
  if (!scheduleEntity && config.device_id) {
    scheduleEntity = findPetlibroScheduleEntity(hass, config.device_id) ?? null;
  }
  if (!scheduleEntity) {
    errors.push({ field: "device.entity" });
  }

  let toggle: GlobalToggleAdapter | null = null;
  if (typeof config.switch === "string") {
    toggle = buildSwitchAdapter(config.switch);
  } else if (
    config.switch &&
    typeof config.switch === "object" &&
    config.switch.state_entity &&
    config.switch.on_button &&
    config.switch.off_button
  ) {
    toggle = buildCompoundAdapter(
      config.switch.state_entity,
      config.switch.on_button,
      config.switch.off_button
    );
  } else if (config.device_id && scheduleEntity) {
    toggle = buildPetlibroScheduleToggleAdapter(config.device_id, scheduleEntity);
  } else if (config.device_id) {
    const switchEntityId = findPetlibroEntityByDevice(
      hass,
      config.device_id,
      (e) => e.entity_id.startsWith("switch.")
    )?.entity_id;
    if (switchEntityId) {
      toggle = buildSwitchAdapter(switchEntityId);
    }
  }

  return { scheduleEntity, toggle, errors };
}

export default class PetLibroDevice extends Device<PetLibroDeviceConfig> {
  private resolved: ResolvedConfig;

  constructor(deviceConfig: PetLibroDeviceConfig, hass: HomeAssistant) {
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
      hasEntryToggle: hasDeviceId,
      hasGlobalToggle: !!this.resolved.toggle,
      canAddEntries: hasDeviceId,
      canRemoveEntries: hasDeviceId,
      canEditEntries: hasDeviceId,
      maxEntries: 99,
      hasWeeklySchedule: true,
    };
  }

  get entryFields(): EntryFieldDescriptor[] {
    const config: AmountConfig = { min: 1, max: 48, step: 1 };
    return [{ role: EntryFieldRole.QUANTITY, config }];
  }

  getWatchedEntities(): string[] {
    const entities: string[] = [];
    if (this.resolved.scheduleEntity) {
      entities.push(this.resolved.scheduleEntity);
    }
    if (this.resolved.toggle) {
      for (const e of this.resolved.toggle.watchedEntities) {
        if (!entities.includes(e)) entities.push(e);
      }
    }
    return entities;
  }

  getConfigErrors(): DeviceConfigError[] {
    return this.resolved.errors;
  }

  getDisplayInfo(): DeviceDisplayInfo {
    const entityId = this.resolved.scheduleEntity;
    if (!entityId) return {};
    const state = this.hass.states[entityId];
    return {
      name: state?.attributes.friendly_name,
      icon: state?.attributes.icon,
    };
  }

  isAvailable(): boolean {
    const entityId = this.resolved.scheduleEntity;
    if (!entityId) return false;
    const entity = this.hass.states[entityId];
    return !!entity && entity.state !== "unavailable";
  }

  getSchedule(): ScheduleEntry[] {
    const entityId = this.resolved.scheduleEntity;
    if (!entityId) return [];
    const state = this.hass.states[entityId];
    if (!state) return [];

    const attrs = state.attributes as Record<string, unknown>;
    const today = getTodayWeekday(this.hass.config.time_zone);
    return parseScheduleAttributes(attrs, today);
  }

  getGlobalToggle(): GlobalToggleInfo | null {
    if (!this.resolved.toggle) return null;
    const state = this.resolved.toggle.getState(this.hass);
    if (state === null) return null;
    return { state };
  }

  getDisplayStatus(entry: ScheduleEntry): EntryStatus {
    const { hour, minute, status } = entry;

    if (status === EntryStatus.DISABLED) {
      return EntryStatus.DISABLED;
    }

    if (status === EntryStatus.PENDING) {
      const scheduledDate = new Date();
      scheduledDate.setHours(hour, minute);
      const isPastDue = new Date().getTime() > scheduledDate.getTime();
      if (isPastDue) {
        return EntryStatus.SKIPPED;
      }
      const globalToggle = this.getGlobalToggle();
      if (globalToggle?.state === false) {
        return EntryStatus.DISABLED;
      }
    }

    return status;
  }

  private buildServicePayload(
    entry: EditScheduleEntry
  ): Record<string, unknown> {
    const time = `${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}`;
    const days = (
      entry.weekdays === undefined ? ALL_WEEKDAYS : [...entry.weekdays]
    ).map((d) => String(d));
    return {
      device_id: this.deviceConfig.device_id,
      time,
      portions: entry.values[0],
      days,
    };
  }

  async addEntry(entry: EditScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    await this.hass.callService(
      "petlibro",
      "add_feeding_plan",
      this.buildServicePayload(entry)
    );
  }

  async editEntry(entry: EditScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id || entry.key === null) return;
    const planId = parseInt(entry.key, 10);
    if (!Number.isFinite(planId)) return;
    await this.hass.callService("petlibro", "edit_feeding_plan", {
      ...this.buildServicePayload(entry),
      plan_id: planId,
    });
  }

  async removeEntry(entry: ScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    const planId = parseInt(entry.key, 10);
    if (!Number.isFinite(planId)) return;
    await this.hass.callService("petlibro", "delete_feeding_plan", {
      device_id: this.deviceConfig.device_id,
      plan_id: planId,
    });
  }

  async toggleEntry(entry: ScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    const planId = parseInt(entry.key, 10);
    if (!Number.isFinite(planId)) return;
    const enable = entry.status === EntryStatus.DISABLED;
    await this.hass.callService("petlibro", "toggle_feeding_plan", {
      device_id: this.deviceConfig.device_id,
      plan_id: planId,
      enable,
    });
  }

  async setGlobalToggle(enabled: boolean): Promise<void> {
    if (!this.resolved.toggle) return;
    if (enabled) {
      await this.resolved.toggle.turnOn(this.hass);
    } else {
      await this.resolved.toggle.turnOff(this.hass);
    }
  }

  getNewEntryDefaults(): EditScheduleEntry {
    return {
      key: null,
      hour: 0,
      minute: 0,
      values: [this.entryFields[0].config.min],
      weekdays: undefined,
    };
  }
}
