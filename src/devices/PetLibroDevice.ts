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
import localize from "../localization";

interface PetlibroScheduleEntry {
  /** Petlibro ID */
  id: number;
  /** Human-readable label (e.g. Breakfast)*/
  label: string;
  /** Dispense time (e.g. 08:00)*/
  time: string;
  /** Whether the entry should be shown in the today view */
  today: boolean;
  /** Dispense amount in cups */
  amount_cups: number;
  /** Dispense amount in ounces */
  amount_oz: number;
  /** Dispense amount in grams */
  amount_g: number;
  /** Dispense amount in milliliters */
  amount_ml: number;
  /** Dispense amount in raw units (portions) */
  amount_raw: number;
  /** Whether the entry is enabled by the user*/
  enabled: boolean;
  /** Days of the week on which the entry should be dispensed */
  repeat_days?: number[] | null;
  /** Whether the entry is recurring */
  recurring: boolean;
  /** Whether to play a calling sound when dispensing */
  sound: boolean;
  /** Status of schedule entry */
  state: string;
}

interface PetlibroEntityAttributes {
  schedule: PetlibroScheduleEntry[];
  feed_conv_factor: number;
}

const PETLIBRO_PLATFORM = "petlibro";

function petlibroStateToStatus(state: string): EntryStatus {
  switch (state) {
    case "pending":
      return EntryStatus.PENDING;
    case "to_be_skipped":
    case "skipped":
      return EntryStatus.SKIPPED;
    case "dispensed":
      return EntryStatus.DISPENSED;
    default:
      return EntryStatus.UNKNOWN;
  }
}

function getPetlibroNativeStatusDisplay(
  state: string
): NativeStatusDisplay | undefined {
  switch (state) {
    case "to_be_skipped":
      return {
        key: state,
        label: localize("status_petlibro.to_be_skipped") ?? state,
        icon: "mdi:debug-step-over",
        color: "var(--warning-color)",
      };
    case "state_5":
      return {
        key: state,
        label: localize("status_petlibro.state_5") ?? state,
        icon: "mdi:help-circle-outline",
        color: "var(--state-inactive-color)",
      };
    default:
      return undefined;
  }
}

function parseTime(time: string): { hour: number; minute: number } {
  const [hStr, mStr] = time.split(":");
  return {
    hour: parseInt(hStr, 10),
    minute: parseInt(mStr, 10),
  };
}

function stringifyTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Integration `repeat_days`: **1 = Monday … 7 = Sunday** (card `Weekday` enum). */
function repeatDaysToWeekdays(days: readonly number[]): Weekday[] {
  return sortWeekdays([...new Set(days)]);
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

function isPetlibroSchedule(
  schedule: unknown
): schedule is PetlibroScheduleEntry[] {
  return (
    Array.isArray(schedule) &&
    schedule.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "time" in item &&
        "today" in item &&
        "amount_raw" in item &&
        "enabled" in item &&
        "repeat_days" in item &&
        "state" in item
    )
  );
}

function findPetlibroScheduleEntity(
  hass: HomeAssistant,
  deviceId: string
): string | undefined {
  const entities = hass.entities;
  if (!entities) return undefined;
  for (const entityId in entities) {
    const entity = entities[entityId];
    if (!entity) continue;
    if (entity.device_id !== deviceId) continue;

    // Entities on the device may be disabled / not yet have a state; skip those.
    const state = hass.states[entityId];
    if (!state) continue;
    if (state.attributes.schedule) {
      return entityId;
    }
  }
  return undefined;
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

  let scheduleEntity = config.entity;

  if (!scheduleEntity && config.device_id) {
    scheduleEntity = findPetlibroScheduleEntity(hass, config.device_id);
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
    toggle = buildPetlibroScheduleToggleAdapter(
      config.device_id,
      scheduleEntity
    );
  }

  return { scheduleEntity: scheduleEntity ?? null, toggle, errors };
}

export default class PetLibroDevice extends Device<PetLibroDeviceConfig> {
  private resolved: ResolvedConfig;
  private readonly _planByEntryKey = new Map<string, PetlibroScheduleEntry>();

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
      maxEntries: 10,
      hasWeeklySchedule: true,
      hasTodaySkip: hasDeviceId,
      hasEntryLabel: hasDeviceId
        ? {
            required: false,
            minLength: 1,
            maxLength: 20,
            pattern: "^\\S+$",
          }
        : false,
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

  private _planToScheduleEntry(plan: PetlibroScheduleEntry): ScheduleEntry {
    const { id, enabled, state, repeat_days, time, label, amount_raw } = plan;
    const { hour, minute } = parseTime(time);

    const key = id.toString();

    const weekdays = repeatDaysToWeekdays(repeat_days ?? []);

    this._planByEntryKey.set(key, plan);
    return {
      key,
      hour,
      minute,
      values: [amount_raw],
      label,
      status: enabled ? petlibroStateToStatus(state) : EntryStatus.DISABLED,
      weekdays,
    };
  }

  getSchedule(): ScheduleEntry[] {
    const entityId = this.resolved.scheduleEntity;
    this._planByEntryKey.clear();
    if (!entityId) return [];
    const state = this.hass.states[entityId];
    if (!state) return [];

    const attrs = state.attributes;
    if (!isPetlibroSchedule(attrs.schedule)) return [];
    return attrs.schedule
      .filter((item) => (item.repeat_days?.length ?? 0) > 0)
      .map((item) => this._planToScheduleEntry(item))
      .sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }

  getGlobalToggle(): GlobalToggleInfo | null {
    if (!this.resolved.toggle) return null;
    const state = this.resolved.toggle.getState(this.hass);
    if (state === null) return null;
    return { state };
  }

  filterScheduleForToday(entries: ScheduleEntry[]): ScheduleEntry[] {
    return entries.filter(
      (entry) => this._planByEntryKey.get(entry.key)?.today
    );
  }

  entryAppliesToday(entry: ScheduleEntry): boolean {
    return this._planByEntryKey.get(entry.key)?.today ?? false;
  }

  getDisplayStatus(entry: ScheduleEntry): EntryStatus {
    const { hour, minute, status } = entry;

    if (status === EntryStatus.PENDING) {
      if (this.entryAppliesToday(entry)) {
        const scheduledDate = new Date();
        scheduledDate.setHours(hour, minute);
        if (Date.now() > scheduledDate.getTime()) {
          return EntryStatus.SKIPPED;
        }
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
    const time = stringifyTime(entry.hour, entry.minute);
    const selected =
      entry.weekdays && entry.weekdays.length > 0
        ? [...entry.weekdays]
        : ALL_WEEKDAYS;
    const days = selected.map((d) => String(d));
    return {
      device_id: this.deviceConfig.device_id,
      time,
      portions: entry.values[0],
      days,
      label: entry.label ?? "",
    };
  }

  async addEntry(entry: EditScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    await this.hass.callService(
      PETLIBRO_PLATFORM,
      "add_feeding_plan",
      this.buildServicePayload(entry)
    );
  }

  async editEntry(entry: EditScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id || entry.key === null) return;
    await this.hass.callService(PETLIBRO_PLATFORM, "edit_feeding_plan", {
      ...this.buildServicePayload(entry),
      plan_id: entry.key,
    });
  }

  async removeEntry(entry: ScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    await this.hass.callService(PETLIBRO_PLATFORM, "delete_feeding_plan", {
      device_id: this.deviceConfig.device_id,
      plan_id: entry.key,
    });
  }

  async toggleEntry(entry: ScheduleEntry): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    const enable = entry.status === EntryStatus.DISABLED;
    await this.hass.callService(PETLIBRO_PLATFORM, "toggle_feeding_plan", {
      device_id: this.deviceConfig.device_id,
      plan_id: entry.key,
      enable,
    });
  }

  canSkipEntryForToday(entry: ScheduleEntry): boolean {
    const meta = this._planByEntryKey.get(entry.key);
    if (!meta) return false;
    return meta.state === "pending";
  }

  canUnskipEntryForToday(entry: ScheduleEntry): boolean {
    return this._planByEntryKey.get(entry.key)?.state === "to_be_skipped";
  }

  getNativeStatusDisplay(
    entry: ScheduleEntry
  ): NativeStatusDisplay | undefined {
    const meta = this._planByEntryKey.get(entry.key);
    if (!meta) return undefined;
    if (!meta.enabled && meta.state === "dispensed") {
      return {
        key: "dispensed",
        label: localize("status.dispensed"),
        icon: "mdi:alert-circle-check-outline",
        color: "var(--success-color)",
      };
    }
    return getPetlibroNativeStatusDisplay(meta.state);
  }

  async setEntrySkipForToday(
    entry: ScheduleEntry,
    skip: boolean
  ): Promise<void> {
    if (!this.deviceConfig.device_id) return;
    await this.hass.callService(PETLIBRO_PLATFORM, "skip_feeding_plan", {
      device_id: this.deviceConfig.device_id,
      plan_id: entry.key,
      skip,
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
      label: "",
      weekdays: undefined,
    };
  }
}
