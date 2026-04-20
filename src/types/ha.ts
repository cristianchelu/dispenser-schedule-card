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
  state: string;
  attributes: Record<string, unknown> & {
    icon?: string;
    friendly_name?: string;
  };
}

/** Subset of the HA entity registry entry surfaced via `hass.entities`. */
export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
  unique_id?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  entities?: Record<string, HassEntityRegistryEntry | undefined>;
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
