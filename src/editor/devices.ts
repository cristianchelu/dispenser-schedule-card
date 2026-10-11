import type { DeviceConfig, DeviceType } from "../devices";
import {
  PETKIT_NATIVE_STATUSES,
  getPetkitNativeStatusDisplay,
} from "../devices/PetKitDevice";
import { getPetlibroNativeStatusDisplay } from "../devices/PetLibroDevice";
import type { DisplayConfigEntry } from "../types/common";
import type { HomeAssistant } from "../types/ha";
import type { HaFormSchema } from "./ha-form";

const DOCS_BASE =
  "https://github.com/cristianchelu/dispenser-schedule-card/blob/main/docs";

/**
 * - `device`: the user picks an HA device; the card discovers its entities.
 * - `entity`: the user picks the schedule entity (and friends) directly.
 */
/** Device block as stored in YAML, possibly incomplete while editing. */
export type DeviceConfigDraft = { type?: string; [key: string]: unknown };

export type DeviceEditorKind = "device" | "entity";

export interface DeviceEditorDescriptor {
  label: string;
  kind: DeviceEditorKind;
  docs: string;
  /** HA integration domain, used to narrow pickers and auto-detect devices. */
  integration?: string;
  /** Device-native status keys that can be targeted from `display:`. */
  nativeStatuses?: string[];
  /** The device's own look for a native status, shown as the default. */
  nativeStatusDefaults?: (key: string) => DisplayConfigEntry | undefined;
  /** Keys merged into a freshly selected device block. */
  defaults?: Partial<DeviceConfig>;
  schema(device: DeviceConfigDraft, hass?: HomeAssistant): HaFormSchema[];
}

/** Entities that belong to `deviceId`, for scoping override pickers. */
function entitiesOfDevice(hass: HomeAssistant | undefined, deviceId?: string) {
  if (!hass || !deviceId) return undefined;
  return Object.values(hass.entities)
    .filter((e) => e?.device_id === deviceId)
    .map((e) => e!.entity_id);
}

const serviceActionsSchema: HaFormSchema = {
  type: "expandable",
  name: "actions",
  icon: "mdi:gesture-tap",
  schema: [
    {
      type: "grid",
      name: "",
      schema: (["add", "edit", "remove", "toggle"] as const).map((name) => ({
        name,
        selector: { text: {} },
      })),
    },
  ],
};

export const DEVICE_EDITORS: Record<DeviceType, DeviceEditorDescriptor> = {
  "petkit": {
    label: "PetKit",
    kind: "device",
    docs: `${DOCS_BASE}/petkit.md`,
    integration: "petkit",
    nativeStatuses: PETKIT_NATIVE_STATUSES,
    nativeStatusDefaults: getPetkitNativeStatusDisplay,
    schema: (device, hass) => {
      const include_entities = entitiesOfDevice(
        hass,
        device.device_id as string | undefined
      );
      return [
        {
          name: "device_id",
          required: true,
          selector: { device: { filter: { integration: "petkit" } } },
        },
        {
          type: "expandable",
          name: "overrides",
          flatten: true,
          icon: "mdi:tune-variant",
          schema: [
            {
              // The schedule lives on the Feeding schedule switch; older
              // integration versions exposed it on a sensor.
              name: "entity",
              selector: {
                entity: {
                  include_entities,
                  filter: { domain: ["switch", "binary_sensor", "sensor"] },
                },
              },
            },
          ],
        },
      ];
    },
  },
  "petlibro": {
    label: "PetLibro",
    kind: "device",
    docs: `${DOCS_BASE}/petlibro.md`,
    integration: "petlibro",
    nativeStatuses: ["to_be_skipped", "state_5"],
    nativeStatusDefaults: getPetlibroNativeStatusDisplay,
    schema: (device, hass) => {
      const include_entities = entitiesOfDevice(
        hass,
        device.device_id as string | undefined
      );
      // The compound `{ state_entity, on_button, off_button }` shape is YAML-only.
      const hasCompoundSwitch = typeof device.switch === "object";
      return [
        {
          name: "device_id",
          required: true,
          selector: { device: { filter: { integration: "petlibro" } } },
        },
        {
          type: "expandable",
          name: "overrides",
          flatten: true,
          icon: "mdi:tune-variant",
          schema: [
            {
              name: "entity",
              selector: {
                entity: {
                  include_entities,
                  filter: { domain: "binary_sensor" },
                },
              },
            },
            ...(hasCompoundSwitch
              ? []
              : [
                  {
                    name: "switch",
                    selector: {
                      entity: {
                        filter: { domain: ["switch", "input_boolean"] },
                      },
                    },
                  },
                ]),
          ],
        },
      ];
    },
  },
  "xiaomi-smart-feeder": {
    label: "Xiaomi Smart Pet Feeder (ESPHome)",
    kind: "entity",
    docs: `${DOCS_BASE}/xiaomi-smart-feeder.md`,
    integration: "esphome",
    schema: () => [
      {
        name: "entity",
        required: true,
        selector: {
          entity: {
            filter: { integration: "esphome", domain: ["sensor", "text"] },
          },
        },
      },
      {
        name: "switch",
        selector: { entity: { filter: { domain: "switch" } } },
      },
      serviceActionsSchema,
    ],
  },
  "xiaomi-smart-feeder-2": {
    label: "Xiaomi Smart Pet Feeder 2",
    kind: "entity",
    docs: `${DOCS_BASE}/xiaomi-smart-feeder-2.md`,
    integration: "xiaomi_home",
    schema: () => [
      {
        name: "entity",
        required: true,
        selector: {
          entity: { filter: { integration: "xiaomi_home", domain: "text" } },
        },
      },
    ],
  },
  "custom": {
    label: "Custom",
    kind: "entity",
    docs: `${DOCS_BASE}/custom.md`,
    defaults: {
      max_entries: 10,
      min_amount: 1,
      max_amount: 10,
      step_amount: 1,
      status_pattern: "",
      status_map: [],
    },
    schema: () => [
      {
        name: "entity",
        required: true,
        selector: { entity: { filter: { domain: ["sensor", "text"] } } },
      },
      { name: "switch", selector: { entity: {} } },
      {
        type: "grid",
        name: "",
        schema: (
          ["max_entries", "min_amount", "max_amount", "step_amount"] as const
        ).map((name) => ({
          name,
          required: true,
          selector: {
            number: { mode: "box", min: 0, step: "any" },
          },
        })),
      },
      { name: "status_pattern", required: true, selector: { text: {} } },
      {
        name: "status_map",
        required: true,
        selector: { text: { multiple: true } },
      },
      serviceActionsSchema,
    ],
  },
};

export const DEVICE_TYPES = Object.keys(DEVICE_EDITORS) as DeviceType[];

export function isKnownDeviceType(type: unknown): type is DeviceType {
  return typeof type === "string" && type in DEVICE_EDITORS;
}

/**
 * Device block for a newly selected type. Carries over `device_id` or
 * `entity` when both types identify the feeder the same way.
 */
export function switchDeviceType(
  previous: DeviceConfigDraft | undefined,
  type: DeviceType
): DeviceConfig {
  const next = DEVICE_EDITORS[type];
  const prevKind = isKnownDeviceType(previous?.type)
    ? DEVICE_EDITORS[previous.type].kind
    : undefined;
  const carried: Record<string, unknown> = {};
  if (prevKind === next.kind && previous) {
    const key = next.kind === "device" ? "device_id" : "entity";
    if (key in previous) carried[key] = previous[key];
  }
  return { type, ...next.defaults, ...carried } as DeviceConfig;
}

/**
 * Best-effort guess for the card picker: the first device of a known
 * integration that exposes a schedule.
 */
export function detectDevice(hass: HomeAssistant | undefined): DeviceConfig {
  for (const type of DEVICE_TYPES) {
    const { kind, integration } = DEVICE_EDITORS[type];
    if (kind !== "device" || !integration) continue;
    const match = Object.values(hass?.entities ?? {}).find(
      (e) =>
        e?.platform === integration &&
        e.device_id &&
        Array.isArray(hass?.states[e.entity_id]?.attributes.schedule)
    );
    if (match) return { type, device_id: match.device_id! } as DeviceConfig;
  }
  return switchDeviceType(undefined, DEVICE_TYPES[0]);
}
