/** HA material hue names; theme CSS uses `var(--<name>-color)`. */
export const HAColor = [
  "red",
  "pink",
  "purple",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "amber",
  "orange",
  "brown",
  "grey",
] as const;

export type HAColor = (typeof HAColor)[number];

export type HassFirstWeekday =
  | "language"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface HassEntity {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
}

export interface HassState {
  state: string;
  attributes: Record<string, unknown> & {
    icon?: string;
    friendly_name?: string;
  };
}

export interface HomeAssistant {
  states: Record<string, HassState | undefined>;
  entities: Record<string, HassEntity | undefined>;
  services: Record<string, Record<string, { fields: Record<string, unknown> }>>;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ): Promise<void>;
  locale: {
    language: string;
    first_weekday?: HassFirstWeekday;
  };
  localize(key: string, params?: Record<string, string>): string;
  config: { state: string; time_zone?: string };
}

/**
 * Placeholder until Lovelace sets `hass` (setConfig often runs first).
 * Devices sync real state on the first `updateHass` / `set hass`.
 */
export const EMPTY_HOME_ASSISTANT: HomeAssistant = {
  states: {},
  entities: {},
  services: {},
  callService: async () => {},
  locale: { language: "en" },
  localize: () => "",
  config: { state: "RUNNING" },
};
