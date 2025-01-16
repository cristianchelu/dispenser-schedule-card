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
  status: EntryStatus;
}

export interface EditScheduleEntry {
  id: number | null;
  hour: number;
  minute: number;
  amount: number;
}

export abstract class Device {
  abstract readonly maxEntries: number;
  abstract readonly maxAmount: number;
  abstract readonly minAmount: number;
  abstract readonly stepAmount: number;

  constructor(
    readonly config: DispenserScheduleCardConfig,
    readonly hass: any
  ) {}

  abstract getSchedule(state: string): Array<ScheduleEntry>;
}
