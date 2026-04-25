import type { DeviceConfig } from "../devices";
import { EntryStatus, type DisplayConfigEntry } from "./common";

export type DisplayConfig = Record<string, DisplayConfigEntry>;

export interface AlternateUnitConfig {
  unit_of_measurement: string | Record<Intl.LDMLPluralRule, string | undefined>;
  conversion_factor: number;
  approximate?: boolean;
}

export interface DispenserScheduleCardConfig {
  device: DeviceConfig;
  editable?: ConfigEditableOption;
  unit_of_measurement?:
    | string
    | Record<Intl.LDMLPluralRule, string | undefined>;
  alternate_unit?: AlternateUnitConfig;
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
    color: "var(--success-color)",
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
    color: "",
  },
  [EntryStatus.SKIPPED]: {
    icon: "mdi:debug-step-over",
    color: "var(--state-inactive-color)",
  },
  [EntryStatus.DISABLED]: {
    icon: "mdi:alert-circle-outline",
    color: "var(--state-inactive-color)",
  },
  [EntryStatus.UNKNOWN]: {
    icon: "mdi:help-circle-outline",
    color: "var(--state-inactive-color)",
  },
};
