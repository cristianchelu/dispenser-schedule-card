import { HomeAssistant } from "./ha";
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
  amount: number;
  status: EntryStatus;
  weekdays?: readonly Weekday[];
}

export interface EditScheduleEntry {
  key: string | null;
  hour: number;
  minute: number;
  amount: number;
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

export interface DeviceDisplayInfo {
  name?: string;
  icon?: string;
}

export interface GlobalToggleInfo {
  state: boolean;
}

export interface DeviceCapabilities {
  hasEntryToggle: boolean;
  hasGlobalToggle: boolean;
  canAddEntries: boolean;
  canRemoveEntries: boolean;
  canEditEntries: boolean;
  maxEntries: number;
  hasWeeklySchedule: boolean;
}

export abstract class Device<
  TDeviceConfig extends { type: string } = { type: string },
> {
  constructor(
    protected readonly deviceConfig: TDeviceConfig,
    protected hass: HomeAssistant
  ) {}

  abstract readonly capabilities: DeviceCapabilities;
  abstract readonly amountConfig: AmountConfig;

  abstract getWatchedEntities(): string[];

  /**
   * @deprecated Use {@link getDisplayInfo} instead. This method exists only
   * to feed hui-generic-entity-row and will be removed when that HA internal
   * component is replaced with a custom row.
   */
  abstract getDisplayEntity(): string;

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

  abstract addEntry(entry: EditScheduleEntry): Promise<void>;
  abstract editEntry(entry: EditScheduleEntry): Promise<void>;
  abstract removeEntry(entry: ScheduleEntry): Promise<void>;
  abstract toggleEntry(entry: ScheduleEntry): Promise<void>;
  abstract setGlobalToggle(enabled: boolean): Promise<void>;

  abstract getNewEntryDefaults(): EditScheduleEntry;
}
