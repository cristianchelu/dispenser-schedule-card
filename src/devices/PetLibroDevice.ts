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
import { HomeAssistant } from "../types/ha";
import { ALL_WEEKDAYS, sortWeekdays, Weekday } from "../types/weekday";

type PetlibroState =
  | "pending"
  | "to_be_skipped"
  | "dispensed"
  | "skipped"
  | "state_5"
  | "unknown"
  | "not_for_today";
interface PetlibroScheduleEntry {
  label: string;
  planID: number;
  time: string;
  amount_cups: number;
  amount_oz: number;
  amount_g: number;
  amount_ml: number;
  amount_raw: number;
  enabled: boolean;
  repeat_days: number[];
  sound: boolean;
  state: PetlibroState;
  state_label: string;
}

interface PetlibroEntityAttributes {
  schedule_type: "full" | "today";
  schedule: PetlibroScheduleEntry[];
  feed_conv_factor: number;
}

const PETLIBRO_PLATFORM = "petlibro";

const PETLIBRO_STATE_TO_STATUS: Record<PetlibroState, EntryStatus> = {
  pending: EntryStatus.PENDING,
  to_be_skipped: EntryStatus.SKIPPED,
  dispensed: EntryStatus.DISPENSED,
  skipped: EntryStatus.SKIPPED,
  state_5: EntryStatus.NONE,
  unknown: EntryStatus.NONE,
  not_for_today: EntryStatus.SKIPPED,
};

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
  return sortWeekdays([...new Set(days)].map((d) => d as Weekday));
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

    if (hass.states[entityId]!.attributes!.schedule_type === "full") {
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
  private readonly _planApiStateByEntryKey = new Map<string, PetlibroState>();

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
    const { planID, enabled, state, repeat_days, time } = plan;
    const { hour, minute } = parseTime(time);

    const key = planID.toString();

    const weekdays = repeatDaysToWeekdays(repeat_days);

    this._planApiStateByEntryKey.set(key, state);
    return {
      key,
      hour,
      minute,
      values: [plan.amount_raw],
      label: plan.label,
      status: enabled ? PETLIBRO_STATE_TO_STATUS[state] : EntryStatus.DISABLED,
      weekdays,
    };
  }

  getSchedule(): ScheduleEntry[] {
    const entityId = this.resolved.scheduleEntity;
    this._planApiStateByEntryKey.clear();
    if (!entityId) return [];
    const state = this.hass.states[entityId];
    if (!state) return [];

    const attrs = state.attributes as unknown as PetlibroEntityAttributes;
    return attrs.schedule
      .map((item) => this._planToScheduleEntry(item))
      .sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }

  getGlobalToggle(): GlobalToggleInfo | null {
    if (!this.resolved.toggle) return null;
    const state = this.resolved.toggle.getState(this.hass);
    if (state === null) return null;
    return { state };
  }

  getDisplayStatus(entry: ScheduleEntry): EntryStatus {
    return entry.status;
  }

  private buildServicePayload(
    entry: EditScheduleEntry
  ): Record<string, unknown> {
    const time = stringifyTime(entry.hour, entry.minute);
    const days = (
      entry.weekdays === undefined ? ALL_WEEKDAYS : [...entry.weekdays]
    ).map((d) => String(d));
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
    if (!this.capabilities.hasTodaySkip || entry.readonly) return false;
    if (!this.entryAppliesToday(entry)) return false;
    return entry.status === EntryStatus.PENDING;
  }

  canUnskipEntryForToday(entry: ScheduleEntry): boolean {
    if (!this.capabilities.hasTodaySkip || entry.readonly) return false;
    if (!this.entryAppliesToday(entry)) return false;
    const state = this._planApiStateByEntryKey.get(entry.key);
    // debugger;
    return state === "not_for_today";
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
