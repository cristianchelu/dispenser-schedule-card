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
  state: string;
  attributes: Record<string, unknown> & {
    icon?: string;
    friendly_name?: string;
  };
}

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
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

export function findEntityRegistryEntry(
  hass: HomeAssistant,
  predicate: (entry: HassEntity) => boolean
): HassEntity | undefined {
  const entities = hass.entities;
  if (!entities) return undefined;
  for (const entityId in entities) {
    const entry = entities[entityId];
    if (entry && predicate(entry)) return entry;
  }
  return undefined;
}
