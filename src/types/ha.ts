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

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
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
