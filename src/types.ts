import { DeviceType } from "./devices";

/** Schedule entry status */
export const EntryStatus = {
  /** Schedule entry triggered successfully */
  DISPENSED: 'dispensed',
  /** Schedule entry failed */
  FAILED: 'failed',
  /** Sechedule entry is actively dispensing */
  DISPENSING: 'dispensing',
  /** Schedule entry not yet triggered */
  PENDING: 'pending',
  /** Schedule entry was skipped for today */
  SKIPPED: 'skipped',
  /** Schedule entry will be skipped until re-enabled */
  DISABLED: 'disabled',
} as const;
export type EntryStatus = typeof EntryStatus[keyof typeof EntryStatus];

/** Icons for each schedule status */
export const StatusIcon: Record<EntryStatus, string> = {
  [EntryStatus.DISPENSED]: 'mdi:check',
  [EntryStatus.FAILED]: 'mdi:close',
  [EntryStatus.DISPENSING]: 'mdi:tray-arrow-down',
  [EntryStatus.PENDING]: 'mdi:clock-outline',
  [EntryStatus.SKIPPED]: 'mdi:clock-remove-outline',
  [EntryStatus.DISABLED]: 'mdi:clock-alert-outline',
} as const;


export const ConfigEditableOption = {
  /** Schedule is always in edit state */
  ALWAYS: 'always',
  /** Schedule edit never available */
  NEVER: 'never',
  /** Schedule edit state available via button */
  TOGGLE: 'toggle'
} as const;
export type ConfigEditableOption = typeof ConfigEditableOption[keyof typeof ConfigEditableOption];

export interface DispenserScheduleCardConfig<T = any> {
  entity: string;
  switch?: string;
  actions?: {
    add?: string;
    edit?: string;
    remove?: string;
    toggle?: string;
  };
  editable?: ConfigEditableOption;
  unit_of_measurement?: string;
  alternate_unit?: {
    unit_of_measurement: string;
    conversion_factor: number;
    approximate?: boolean;
  };
  device_type?: DeviceType;
  device_config: T;
}

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

  constructor(readonly config: DispenserScheduleCardConfig, readonly hass: any) { }

  abstract getSchedule(state: string): Array<ScheduleEntry>;
}