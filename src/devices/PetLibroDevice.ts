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
  Weekday,
} from "../types/common";
import { HassEntityRegistryEntry, HomeAssistant } from "../types/ha";
import { canonicalizeWeekdays } from "../types/scheduleWeekdays";
import { ALL_WEEKDAYS, getTodayWeekday } from "../types/weekday";

const PETLIBRO_PLATFORM = "petlibro";
/** Slug suffixes on `entity_id` (after `_` or `-`) for auto-discovery. */
const SCHEDULE_ENTITY_SLUG = "feeding_schedule";
const ENABLE_BUTTON_ENTITY_SLUG = "enable_feeding_plan";
const DISABLE_BUTTON_ENTITY_SLUG = "disable_feeding_plan";

/** Attribute keys that are not feeding plans. */
const RESERVED_ATTRIBUTE_KEYS = new Set([
  "device_class",
  "icon",
  "friendly_name",
  "unit_of_measurement",
  "state_class",
  "attribution",
  "supported_features",
  "assumed_state",
  "restored",
]);

const FEED_STATE_TO_STATUS: Record<string, EntryStatus> = {
  "Pending": EntryStatus.PENDING,
  "Completed": EntryStatus.DISPENSED,
  "Skipped": EntryStatus.SKIPPED,
  "Skipped, Time Passed": EntryStatus.SKIPPED,
};

/** Per-plan attribute shape on the petlibro `feeding_schedule` binary_sensor. */
interface PetLibroPlanAttribute {
  planID?: number;
  time?: string;
  amount_raw?: number;
  enabled?: boolean;
  repeat_days?: string;
  sound?: boolean;
  feed_state?: string;
}

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

/**
 * Adapter that hides whether the global toggle is implemented as a single
 * switch entity or as the petlibro binary_sensor + 2-buttons compound. The
 * rest of the device code only sees this interface.
 */
interface GlobalToggleAdapter {
  watchedEntities: string[];
  getState(hass: HomeAssistant): boolean | null;
  turnOn(hass: HomeAssistant): Promise<void>;
  turnOff(hass: HomeAssistant): Promise<void>;
}

function listRegistryEntries(hass: HomeAssistant): HassEntityRegistryEntry[] {
  const entities = hass?.entities;
  if (!entities) return [];
  const out: HassEntityRegistryEntry[] = [];
  for (const entry of Object.values(entities)) {
    if (entry) out.push(entry);
  }
  return out;
}

function findPetlibroEntityByDevice(
  hass: HomeAssistant,
  deviceId: string,
  predicate: (entry: HassEntityRegistryEntry) => boolean
): HassEntityRegistryEntry | undefined {
  return listRegistryEntries(hass).find(
    (entry) =>
      entry.platform === PETLIBRO_PLATFORM &&
      entry.device_id === deviceId &&
      predicate(entry)
  );
}

function entityIdEndsWithSlug(
  entityId: string,
  slug: string,
  domainPrefix?: string
): boolean {
  if (domainPrefix && !entityId.startsWith(`${domainPrefix}.`)) {
    return false;
  }
  const byUnderscore = entityId.endsWith(`_${slug}`);
  const byDash = entityId.endsWith(`-${slug}`);
  if (!byUnderscore && !byDash) {
    return false;
  }
  // HACK: CHANGEME
  // PetLibro also exposes `binary_sensor.*_today_s_feeding_schedule`, which still
  // ends with `_feeding_schedule` but is today's summary, not the full plan payload
  // (no `plan_*` attributes). Never treat it as the schedule entity.
  if (
    slug === SCHEDULE_ENTITY_SLUG &&
    entityId.endsWith("_today_s_feeding_schedule")
  ) {
    return false;
  }
  return true;
}

function findPetlibroEntityBySlug(
  hass: HomeAssistant,
  deviceId: string,
  slug: string,
  domainPrefix?: string
): string | undefined {
  return findPetlibroEntityByDevice(hass, deviceId, (e) =>
    entityIdEndsWithSlug(e.entity_id, slug, domainPrefix)
  )?.entity_id;
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
    scheduleEntity =
      findPetlibroEntityBySlug(
        hass,
        config.device_id,
        SCHEDULE_ENTITY_SLUG,
        "binary_sensor"
      ) ?? null;
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
  } else if (config.device_id) {
    const switchEntityId = findPetlibroEntityByDevice(
      hass,
      config.device_id,
      (e) => e.entity_id.startsWith("switch.")
    )?.entity_id;
    if (switchEntityId) {
      toggle = buildSwitchAdapter(switchEntityId);
    } else {
      const stateEntity =
        scheduleEntity ??
        findPetlibroEntityBySlug(
          hass,
          config.device_id,
          SCHEDULE_ENTITY_SLUG,
          "binary_sensor"
        );
      const onButton = findPetlibroEntityBySlug(
        hass,
        config.device_id,
        ENABLE_BUTTON_ENTITY_SLUG,
        "button"
      );
      const offButton = findPetlibroEntityBySlug(
        hass,
        config.device_id,
        DISABLE_BUTTON_ENTITY_SLUG,
        "button"
      );
      if (stateEntity && onButton && offButton) {
        toggle = buildCompoundAdapter(stateEntity, onButton, offButton);
      }
    }
  }

  return { scheduleEntity, toggle, errors };
}

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

function parseRepeatDays(raw: string | undefined): Weekday[] | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const days: Weekday[] = [];
    for (const v of parsed) {
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      if (n >= 1 && n <= 7) days.push(n as Weekday);
    }
    if (days.length === 0) return null;
    return days;
  } catch {
    return null;
  }
}

function mapFeedState(feedState: string | undefined): EntryStatus {
  if (!feedState) return EntryStatus.PENDING;
  return FEED_STATE_TO_STATUS[feedState] ?? EntryStatus.PENDING;
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
      hasEntryToggle: false,
      hasGlobalToggle: !!this.resolved.toggle,
      canAddEntries: hasDeviceId,
      canRemoveEntries: false,
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

    const today = getTodayWeekday(this.hass.config.time_zone);
    const entries: ScheduleEntry[] = [];

    for (const [attrKey, attrValue] of Object.entries(state.attributes)) {
      if (RESERVED_ATTRIBUTE_KEYS.has(attrKey)) continue;
      if (!attrValue || typeof attrValue !== "object") continue;
      if (Array.isArray(attrValue)) continue;

      const plan = attrValue as PetLibroPlanAttribute;
      if (typeof plan.planID !== "number") continue;

      const { hour, minute } = parseTime(plan.time);
      const amount = typeof plan.amount_raw === "number" ? plan.amount_raw : 0;
      const enabled = plan.enabled !== false;
      const baseStatus = mapFeedState(plan.feed_state);
      const status = enabled ? baseStatus : EntryStatus.DISABLED;

      const repeatDays = parseRepeatDays(plan.repeat_days);
      if (repeatDays === null) {
        if (plan.feed_state && plan.feed_state !== "Not Scheduled Today") {
          entries.push({
            key: String(plan.planID),
            hour,
            minute,
            values: [amount],
            status,
            weekdays: [today],
            readonly: true,
          });
        }
        continue;
      }

      const isAllDays = repeatDays.length === ALL_WEEKDAYS.length;
      const weekdays = isAllDays ? undefined : canonicalizeWeekdays(repeatDays);

      entries.push({
        key: String(plan.planID),
        hour,
        minute,
        values: [amount],
        status,
        weekdays,
      });
    }

    return entries.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
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
    const days =
      entry.weekdays === undefined
        ? ALL_WEEKDAYS.map((d) => String(d))
        : entry.weekdays.map((d) => String(d));
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

  async removeEntry(_entry: ScheduleEntry): Promise<void> {
    // Not supported in v1: the integration only exposes per-plan deletion via
    // a select+button two-step. Capabilities flag this off so the UI never
    // calls into here.
  }

  async toggleEntry(_entry: ScheduleEntry): Promise<void> {
    // Same rationale as removeEntry.
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
