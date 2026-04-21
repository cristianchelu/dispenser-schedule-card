import { type HAColor, HomeAssistant } from "./ha";
import { appliesOnWeekday } from "./scheduleWeekdays";
import { Weekday, getTodayWeekday } from "./weekday";

export { Weekday };

/** Schedule entry status */
export const EntryStatus = {
  /** Schedule entry triggered successfully */
  DISPENSED: "dispensed",
  /** Schedule entry failed */
  FAILED: "failed",
  /** Schedule entry is actively dispensing */
  DISPENSING: "dispensing",
  /** Schedule entry not yet triggered */
  PENDING: "pending",
  /** Schedule entry was skipped for today */
  SKIPPED: "skipped",
  /** Schedule entry will be skipped until re-enabled */
  DISABLED: "disabled",
  /** No status available */
  NONE: "none",
} as const;
export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus];

export interface ScheduleEntry {
  /** Opaque key for the device to reference this entry. Card never parses it. */
  key: string;
  hour: number;
  minute: number;
  values: number[];
  /** Plan label (e.g. PetLibro); optional for devices without `hasEntryLabel`. */
  label?: string;
  status: EntryStatus;
  weekdays?: readonly Weekday[];
  /**
   * Marks an entry the card cannot safely roundtrip (e.g. a one-time feed
   * surfaced for visibility in today's view but not editable). The card
   * hides edit/remove/toggle affordances and excludes it from the edit list.
   */
  readonly?: boolean;
}

export interface EditScheduleEntry {
  key: string | null;
  hour: number;
  minute: number;
  values: number[];
  /** Set when `DeviceCapabilities.hasEntryLabel` is not `false`. */
  label?: string;
  weekdays?: readonly Weekday[];
}

/**
 * How the UI constrains amount input fields.
 * Every amount-capable device converges on this shape.
 * Hardcoded devices set it as a constant; CustomDevice reads it from YAML config.
 */
export interface AmountConfig {
  min: number;
  max: number;
  step: number;
}

export const EntryFieldRole = {
  QUANTITY: "quantity",
  POSITION: "position",
} as const;
export type EntryFieldRole =
  (typeof EntryFieldRole)[keyof typeof EntryFieldRole];

export interface EntryFieldDescriptor {
  role: EntryFieldRole;
  config: AmountConfig;
  /**
   * Which physical compartment this field corresponds to, expressed as an HA theme hue
   * so the card can match the same color coding shown on the device (e.g. feeder bowls).
   */
  compartmentColor?: HAColor;
}

export interface DeviceDisplayInfo {
  name?: string;
  icon?: string;
}

export interface GlobalToggleInfo {
  state: boolean;
}

/** Declarative HTML constraint payload for the entry label field (native validation). */
export interface EntryLabelConstraints {
  required?: boolean;
  minLength: number;
  maxLength: number;
  /** Value for the input `pattern` attribute (e.g. no spaces). */
  pattern: string;
}

export interface DeviceCapabilities {
  hasEntryToggle: boolean;
  hasGlobalToggle: boolean;
  canAddEntries: boolean;
  canRemoveEntries: boolean;
  canEditEntries: boolean;
  maxEntries: number;
  hasWeeklySchedule: boolean;
  /** One-off skip / un-skip for today only (e.g. PetLibro `skip_feeding_plan`). */
  hasTodaySkip: boolean;
  /**
   * When not `false`, the add/edit form shows a label text field with these constraints.
   */
  hasEntryLabel: false | EntryLabelConstraints;
}

/**
 * Structured, opaque config error reported by a device. The `field` is a
 * YAML path (e.g. "device.entity") and is rendered verbatim through a
 * single generic, reusable translation key.
 */
export interface DeviceConfigError {
  field: string;
}

export abstract class Device<
  TDeviceConfig extends { type: string } = { type: string },
> {
  constructor(
    protected readonly deviceConfig: TDeviceConfig,
    protected hass: HomeAssistant
  ) {}

  abstract readonly capabilities: DeviceCapabilities;
  abstract readonly entryFields: EntryFieldDescriptor[];

  abstract getWatchedEntities(): string[];

  /**
   * Structured config issues to surface at the top of the card. Default
   * implementation reports none; devices with auto-discovery can return
   * unresolved YAML field paths so the user knows what to set manually.
   */
  getConfigErrors(): DeviceConfigError[] {
    return [];
  }

  abstract getDisplayInfo(): DeviceDisplayInfo;
  abstract isAvailable(): boolean;

  updateHass(hass: HomeAssistant): void {
    this.hass = hass;
  }

  abstract getSchedule(): ScheduleEntry[];
  abstract getGlobalToggle(): GlobalToggleInfo | null;
  abstract getDisplayStatus(entry: ScheduleEntry): EntryStatus;

  /**
   * Entries that apply on “today” in the HA user timezone.
   * When `hasWeeklySchedule` is false, returns `entries` unchanged.
   */
  filterScheduleForToday(entries: ScheduleEntry[]): ScheduleEntry[] {
    if (!this.capabilities.hasWeeklySchedule) return entries;
    const today = getTodayWeekday(this.hass.config.time_zone);
    return entries.filter((entry) => appliesOnWeekday(entry.weekdays, today));
  }

  /** Whether this entry runs on today's weekday (always true without weekly schedule). */
  entryAppliesToday(entry: ScheduleEntry): boolean {
    if (!this.capabilities.hasWeeklySchedule) return true;
    const today = getTodayWeekday(this.hass.config.time_zone);
    return appliesOnWeekday(entry.weekdays, today);
  }

  /** Show “skip for today” in the row menu (devices with `hasTodaySkip` may override). */
  canSkipEntryForToday(_entry: ScheduleEntry): boolean {
    return false;
  }

  /** Show “un-skip for today” in the row menu (devices with `hasTodaySkip` may override). */
  canUnskipEntryForToday(_entry: ScheduleEntry): boolean {
    return false;
  }

  setEntrySkipForToday(_entry: ScheduleEntry, _skip: boolean): Promise<void> {
    return Promise.resolve();
  }

  abstract addEntry(entry: EditScheduleEntry): Promise<void>;
  abstract editEntry(entry: EditScheduleEntry): Promise<void>;
  abstract removeEntry(entry: ScheduleEntry): Promise<void>;
  abstract toggleEntry(entry: ScheduleEntry): Promise<void>;
  abstract setGlobalToggle(enabled: boolean): Promise<void>;

  abstract getNewEntryDefaults(): EditScheduleEntry;
}
