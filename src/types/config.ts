import { DeviceType } from "../devices";
import { EntryStatus } from "./common";

export type DisplayConfigEntry = {
  icon?: string;
  color?: string;
  label?: string;
};

export type DisplayConfig = Record<string, DisplayConfigEntry>;

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
  device: T & { type: DeviceType };
  display?: DisplayConfig;
}

export const ConfigEditableOption = {
  /** Schedule is always in edit state */
  ALWAYS: "always",
  /** Schedule edit never available */
  NEVER: "never",
  /** Schedule edit state available via button */
  TOGGLE: "toggle",
} as const;
export type ConfigEditableOption =
  (typeof ConfigEditableOption)[keyof typeof ConfigEditableOption];

export const DefaultDisplayConfig: DisplayConfig = {
  [EntryStatus.DISPENSED]: {
    icon: "mdi:check",
    color: "var(--state-active-color)",
  },
  [EntryStatus.FAILED]: {
    icon: "mdi:close",
    color: "var(--error-color)",
  },
  [EntryStatus.DISPENSING]: {
    icon: "mdi:tray-arrow-down",
    color: "var(--state-active-color)",
  },
  [EntryStatus.PENDING]: {
    icon: "mdi:clock-outline",
    color: "var(--state-icon-color)",
  },
  [EntryStatus.SKIPPED]: {
    icon: "mdi:clock-remove-outline",
    color: "var(--state-inactive-color)",
  },
  [EntryStatus.DISABLED]: {
    icon: "mdi:clock-alert-outline",
    color: "var(--state-inactive-color)",
  },
};
