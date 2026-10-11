import { css, html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators/custom-element.js";

import type { DeviceConfig } from "../devices";
import {
  DefaultDisplayConfig,
  type DispenserScheduleCardConfig,
  type DisplayConfig,
} from "../types/config";
import type { HomeAssistant } from "../types/ha";
import localize from "../localization";
import {
  DEVICE_EDITORS,
  DEVICE_TYPES,
  type DeviceConfigDraft,
  isKnownDeviceType,
  switchDeviceType,
} from "./devices";
import { loadHaForm, type HaFormSchema } from "./ha-form";

type UnitConfig = NonNullable<
  DispenserScheduleCardConfig["unit_of_measurement"]
>;

interface UnitFields {
  unit_of_measurement?: string;
  unit_of_measurement_one?: string;
}

interface DisplayFormData extends UnitFields {
  editable: NonNullable<DispenserScheduleCardConfig["editable"]>;
  alternate_unit?: UnitFields & {
    conversion_factor?: number;
    approximate?: boolean;
  };
  display?: DisplayConfig;
}

/** Drops empty strings, nullish values and objects left empty by that. */
function compact<T>(value: T): T {
  if (Array.isArray(value) || typeof value !== "object" || value === null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const c = compact(v);
    if (c === undefined || c === null || c === "") continue;
    if (typeof c === "object" && !Array.isArray(c) && !Object.keys(c).length) {
      continue;
    }
    out[key] = c;
  }
  return out as T;
}

function toUnitFields(unit: UnitConfig | undefined): UnitFields {
  if (typeof unit === "object" && unit !== null) {
    return {
      unit_of_measurement: unit.other,
      unit_of_measurement_one: unit.one,
    };
  }
  return { unit_of_measurement: unit };
}

/**
 * Collapses to a plain string when only `other` is set. Plural categories
 * the editor does not show (`few`, `many`, ...) are kept from `previous`.
 */
function fromUnitFields(
  fields: UnitFields | undefined,
  previous: UnitConfig | undefined
): UnitConfig | undefined {
  const kept =
    typeof previous === "object" && previous !== null ? previous : {};
  const unit = compact({
    ...kept,
    one: fields?.unit_of_measurement_one,
    other: fields?.unit_of_measurement,
  });
  const keys = Object.keys(unit);
  if (keys.length === 0) return undefined;
  if (keys.length === 1 && unit.other) return unit.other;
  return unit as UnitConfig;
}

const t = (key: string, search?: string, replace?: string) =>
  localize(`editor.${key}`, search, replace) ?? key;

@customElement("dispenser-schedule-card-editor")
export class DispenserScheduleCardEditor extends LitElement {
  declare hass?: HomeAssistant;
  declare _config?: DispenserScheduleCardConfig;
  declare _formReady: boolean;

  static get properties() {
    return {
      hass: { attribute: false },
      _config: { state: true },
      _formReady: { state: true },
    };
  }

  constructor() {
    super();
    this._formReady = !!customElements.get("ha-form");
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this._formReady) {
      void loadHaForm().then(() => (this._formReady = true));
    }
  }

  setConfig(config: DispenserScheduleCardConfig) {
    this._config = config;
  }

  private _emit(config: DispenserScheduleCardConfig) {
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _computeLabel = (schema: HaFormSchema) =>
    "title" in schema && schema.title ? schema.title : t(schema.name);

  private _computeHelper = (schema: HaFormSchema) =>
    "helper" in schema ? schema.helper : undefined;

  // --- Device type ---

  private _typeSchema(): HaFormSchema[] {
    return [
      {
        name: "device_type",
        required: true,
        selector: {
          select: {
            mode: "dropdown",
            options: DEVICE_TYPES.map((value) => ({
              value,
              label: DEVICE_EDITORS[value].label,
            })),
          },
        },
      },
    ];
  }

  private _typeChanged(ev: CustomEvent) {
    const type = ev.detail.value.device_type;
    if (!this._config || !isKnownDeviceType(type)) return;
    if (type === this._config.device?.type) return;
    this._emit({
      ...this._config,
      device: switchDeviceType(this._config.device as DeviceConfigDraft, type),
    });
  }

  // --- Device ---

  private _deviceChanged(ev: CustomEvent) {
    if (!this._config) return;
    const { type } = this._config.device;
    const device = compact({ type, ...ev.detail.value }) as DeviceConfig;
    this._emit({ ...this._config, device });
  }

  // --- Display ---

  private _statusKeys(): string[] {
    const type = this._config?.device?.type;
    const native = isKnownDeviceType(type)
      ? (DEVICE_EDITORS[type].nativeStatuses ?? [])
      : [];
    return [...Object.keys(DefaultDisplayConfig), ...native];
  }

  private _statusLabel(key: string): string {
    return (
      localize(`status.${key}`) ??
      localize(`status_${this._config?.device?.type}.${key}`) ??
      key
    );
  }

  private _displaySchema(): HaFormSchema[] {
    const type = this._config?.device?.type;
    const nativeDefaults = isKnownDeviceType(type)
      ? DEVICE_EDITORS[type].nativeStatusDefaults
      : undefined;
    const unitGrid: HaFormSchema = {
      type: "grid",
      name: "",
      schema: [
        { name: "unit_of_measurement", selector: { text: {} } },
        { name: "unit_of_measurement_one", selector: { text: {} } },
      ],
    };
    return [
      {
        name: "editable",
        required: true,
        selector: {
          select: {
            mode: "dropdown",
            options: (["toggle", "always", "never"] as const).map((value) => ({
              value,
              label: t(`editable_${value}`),
            })),
          },
        },
      },
      unitGrid,
      {
        type: "expandable",
        name: "alternate_unit",
        icon: "mdi:scale-balance",
        schema: [
          unitGrid,
          {
            type: "grid",
            name: "",
            schema: [
              {
                name: "conversion_factor",
                selector: { number: { mode: "box", step: "any" } },
              },
              { name: "approximate", selector: { boolean: {} } },
            ],
          },
        ],
      },
      {
        type: "expandable",
        name: "display",
        icon: "mdi:palette-outline",
        schema: this._statusKeys().map((key) => {
          const defaults =
            DefaultDisplayConfig[key] ?? nativeDefaults?.(key) ?? {};
          return {
            type: "expandable",
            name: key,
            title: this._statusLabel(key),
            icon: this._config?.display?.[key]?.icon ?? defaults.icon,
            schema: [
              {
                type: "grid",
                name: "",
                schema: [
                  {
                    name: "icon",
                    selector: { icon: { placeholder: defaults.icon } },
                  },
                  {
                    name: "color",
                    selector: { text: {} },
                    helper: defaults.color
                      ? t("default", "{value}", defaults.color)
                      : undefined,
                  },
                ],
              },
              { name: "label", selector: { text: {} } },
            ],
          };
        }),
      },
    ];
  }

  private _displayData(): DisplayFormData {
    const config = this._config!;
    return {
      editable: config.editable ?? "toggle",
      ...toUnitFields(config.unit_of_measurement),
      alternate_unit: config.alternate_unit && {
        ...toUnitFields(config.alternate_unit.unit_of_measurement),
        conversion_factor: config.alternate_unit.conversion_factor,
        approximate: config.alternate_unit.approximate,
      },
      display: config.display,
    };
  }

  private _displayChanged(ev: CustomEvent) {
    const config = this._config;
    if (!config) return;
    const value: DisplayFormData = ev.detail.value;

    const alternate = compact({
      unit_of_measurement: fromUnitFields(
        value.alternate_unit,
        config.alternate_unit?.unit_of_measurement
      ),
      conversion_factor: value.alternate_unit?.conversion_factor,
      approximate: value.alternate_unit?.approximate || undefined,
    });

    const {
      editable: _editable,
      unit_of_measurement: _unit,
      alternate_unit: _alternate,
      display: _display,
      ...rest
    } = config;

    this._emit(
      compact({
        ...rest,
        // `toggle` is the default; don't write it unless it was already there.
        editable:
          value.editable === "toggle" && !config.editable
            ? undefined
            : value.editable,
        unit_of_measurement: fromUnitFields(value, config.unit_of_measurement),
        alternate_unit:
          alternate as DispenserScheduleCardConfig["alternate_unit"],
        display: value.display,
      })
    );
  }

  // --- Render ---

  render() {
    if (!this.hass || !this._config || !this._formReady) return nothing;

    const device = this._config.device as DeviceConfigDraft | undefined;
    const descriptor = isKnownDeviceType(device?.type)
      ? DEVICE_EDITORS[device.type]
      : undefined;
    const hasCompoundSwitch = typeof device?.switch === "object";

    return html`
      <div class="section">
        <h3>${t("device_section")}</h3>
        <ha-form
          .hass=${this.hass}
          .data=${{ device_type: device?.type }}
          .schema=${this._typeSchema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._typeChanged}
        ></ha-form>
        ${descriptor
          ? html`
              <a
                class="docs"
                href=${descriptor.docs}
                target="_blank"
                rel="noreferrer"
              >
                ${t("documentation")}
              </a>
              <ha-form
                .hass=${this.hass}
                .data=${device}
                .schema=${descriptor.schema(device ?? {}, this.hass)}
                .computeLabel=${this._computeLabel}
                .computeHelper=${this._computeHelper}
                @value-changed=${this._deviceChanged}
              ></ha-form>
              ${hasCompoundSwitch
                ? html`<ha-alert alert-type="info">
                    ${t("compound_switch")}
                  </ha-alert>`
                : nothing}
            `
          : html`<ha-alert alert-type="warning">
              ${t("unknown_device", "{type}", String(device?.type))}
            </ha-alert>`}
      </div>
      <div class="section">
        <h3>${t("display_section")}</h3>
        <ha-form
          .hass=${this.hass}
          .data=${this._displayData()}
          .schema=${this._displaySchema()}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._displayChanged}
        ></ha-form>
      </div>
    `;
  }

  static get styles() {
    return css`
      .section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .section + .section {
        margin-top: 24px;
      }
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-l, 16px);
        font-weight: var(--ha-font-weight-medium, 500);
      }
      .docs {
        align-self: flex-end;
        font-size: var(--ha-font-size-s, 12px);
        color: var(--primary-color);
      }
    `;
  }
}
