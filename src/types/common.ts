import { DispenserScheduleCardConfig } from "./config";

/** Schedule entry status */
export const EntryStatus = {
  /** Schedule entry triggered successfully */
  DISPENSED: "dispensed",
  /** Schedule entry failed */
  FAILED: "failed",
  /** Sechedule entry is actively dispensing */
  DISPENSING: "dispensing",
  /** Schedule entry not yet triggered */
  PENDING: "pending",
  /** Schedule entry was skipped for today */
  SKIPPED: "skipped",
  /** Schedule entry will be skipped until re-enabled */
  DISABLED: "disabled",
} as const;
export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus];

export interface ScheduleEntry {
  id: number;
  hour: number;
  minute: number;
  amount: number;
  amount1?: number;
  amount2?: number;
  status: EntryStatus;
}

export interface EditScheduleEntry {
  id: number | null;
  hour: number;
  minute: number;
  amount: number;
  amount1?: number;
  amount2?: number;
}

export abstract class Device {
  abstract readonly maxEntries: number;
  abstract readonly maxAmount: number;
  abstract readonly minAmount: number;
  abstract readonly stepAmount: number;

  /** Whether this device has dual hoppers (shows separate amount1/amount2). */
  get isDualHopper(): boolean {
    return false;
  }

  constructor(
    readonly config: DispenserScheduleCardConfig,
    readonly hass: any
  ) {}

  abstract getSchedule(state: string): Array<ScheduleEntry>;

  /**
   * Handle saving an entry (add or edit). Return true if handled by the
   * device implementation, false to fall back to per-entry service dispatch.
   */
  handleSave(
    _hass: any,
    _schedules: Array<ScheduleEntry>,
    _entry: EditScheduleEntry,
    _scheduleEntity: any,
  ): boolean {
    return false;
  }

  /**
   * Handle removing an entry. Return true if handled, false to fall back.
   */
  handleRemove(
    _hass: any,
    _schedules: Array<ScheduleEntry>,
    _entry: EditScheduleEntry,
    _scheduleEntity: any,
  ): boolean {
    return false;
  }
}
