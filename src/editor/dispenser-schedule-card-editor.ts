import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement } from "lit/decorators/custom-element.js";

import type { DeviceConfig } from "../devices";
import {
  DefaultDisplayConfig,
  type DispenserScheduleCardConfig,
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

type AlternateUnitConfig = NonNullable<
  DispenserScheduleCardConfig["alternate_unit"]
>;

/** A unit as form data: the plain unit is `other`, plus any plural forms. */
type UnitForms = Partial<Record<Intl.LDMLPluralRule, string>>;

/** `other` is edited as the unit itself, so it is not a "plural form". */
const PLURAL_FORMS = ["zero", "one", "two", "few", "many"] as const;

const PLURALIZATION_DOCS =
  "https://github.com/cristianchelu/dispenser-schedule-card#pluralization";

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

function toUnitForms(unit: UnitConfig | undefined): UnitForms {
  if (typeof unit === "object" && unit !== null) return { ...unit };
  return unit ? { other: unit } : {};
}

/** Collapses to a plain string when only `other` is set. */
function fromUnitForms(forms: UnitForms): UnitConfig | undefined {
  const unit = compact(forms);
  const keys = Object.keys(unit);
  if (keys.length === 0) return undefined;
  if (keys.length === 1 && unit.other) return unit.other;
  return unit as UnitConfig;
}

/** The first few whole numbers that use each plural form, e.g. `1, 21, 31`. */
function pluralExamples(language: string): Map<Intl.LDMLPluralRule, string> {
  const examples = new Map<Intl.LDMLPluralRule, number[]>();
  let rules: Intl.PluralRules;
  try {
    rules = new Intl.PluralRules(language);
  } catch (_error) {
    return new Map();
  }
  for (let n = 0; n <= 200; n++) {
    const form = rules.select(n);
    const list = examples.get(form) ?? [];
    if (list.length < 4) examples.set(form, [...list, n]);
  }
  return new Map(
    [...examples].map(([form, list]) => [
      form,
      list.length > 3 ? `${list.slice(0, 3).join(", ")}, …` : list.join(", "),
    ])
  );
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
    "title" in schema && schema.title
      ? schema.title
      : t(
          `${"type" in schema && schema.type === "expandable" ? "group" : "field"}.${schema.name}`
        );

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

  private _editableSchema(): HaFormSchema[] {
    return [
      {
        name: "editable",
        required: true,
        selector: {
          button_toggle: {
            options: (["always", "toggle", "never"] as const).map((value) => ({
              value,
              label: t(`editable.${value}`),
            })),
          },
        },
      },
    ];
  }

  private _editableChanged(ev: CustomEvent) {
    const config = this._config;
    if (!config) return;
    const { editable } = ev.detail.value;
    this._emit(
      compact({
        ...config,
        // `toggle` is the default; don't write it unless it was already there.
        editable:
          editable === "toggle" && !config.editable ? undefined : editable,
      })
    );
  }

  private _unitChanged(unit: UnitConfig | undefined) {
    if (!this._config) return;
    this._emit(compact({ ...this._config, unit_of_measurement: unit }));
  }

  private _alternateChanged(alternate: Partial<AlternateUnitConfig>) {
    if (!this._config) return;
    this._emit(
      compact({
        ...this._config,
        alternate_unit: compact({
          ...alternate,
          approximate: alternate.approximate || undefined,
        }) as AlternateUnitConfig,
      })
    );
  }

  private _statusSchema(): HaFormSchema[] {
    const type = this._config?.device?.type;
    const nativeDefaults = isKnownDeviceType(type)
      ? DEVICE_EDITORS[type].nativeStatusDefaults
      : undefined;
    return [
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
                      ? t("help.color_default", "{value}", defaults.color)
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

  private _statusChanged(ev: CustomEvent) {
    if (!this._config) return;
    this._emit(compact({ ...this._config, display: ev.detail.value.display }));
  }

  // --- Units ---

  /**
   * The plural forms worth offering: those the user's language uses, plus
   * any already configured (e.g. written for another language).
   */
  private _pluralForms(forms: UnitForms): Intl.LDMLPluralRule[] {
    let used: string[] = [];
    try {
      used = new Intl.PluralRules(this.hass?.locale?.language).resolvedOptions()
        .pluralCategories;
    } catch (_error) {
      // Unknown language: only show what is configured.
    }
    return PLURAL_FORMS.filter((form) => used.includes(form) || forms[form]);
  }

  private _languageName(): string {
    const language = this.hass?.locale?.language ?? "en";
    try {
      return (
        new Intl.DisplayNames([language], { type: "language" }).of(language) ??
        language
      );
    } catch (_error) {
      return language;
    }
  }

  private _renderPanel(
    header: string,
    icon: string,
    content: TemplateResult,
    secondary?: string
  ) {
    return html`
      <ha-expansion-panel outlined .header=${header} .secondary=${secondary}>
        <ha-icon slot="leading-icon" .icon=${icon}></ha-icon>
        <div class="content">${content}</div>
      </ha-expansion-panel>
    `;
  }

  /** The unit field and, folded away, its plural forms. */
  private _renderUnitFields(
    unit: UnitConfig | undefined,
    placeholder: string | undefined,
    onChange: (unit: UnitConfig | undefined) => void
  ) {
    const forms = toUnitForms(unit);
    const pluralForms = this._pluralForms(forms);
    const examples = pluralExamples(this.hass?.locale?.language ?? "en");
    const changed = (ev: CustomEvent) => {
      ev.stopPropagation();
      onChange(fromUnitForms({ ...forms, ...ev.detail.value }));
    };
    const pluralLabel = (schema: HaFormSchema) => {
      const form = schema.name as Intl.LDMLPluralRule;
      const example = examples.get(form);
      return `${t(`plural.${form}`)}${example ? ` (${example})` : ""}`;
    };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${forms}
        .schema=${[
          {
            name: "other",
            selector: { text: { placeholder } },
          },
        ]}
        .computeLabel=${() => t("field.unit")}
        @value-changed=${changed}
      ></ha-form>
      ${pluralForms.length
        ? this._renderPanel(
            t("group.plural_forms"),
            "mdi:format-letter-case",
            html`
              <p>
                ${t("help.plural_forms", "{language}", this._languageName())}
                <a href=${PLURALIZATION_DOCS} target="_blank" rel="noreferrer">
                  ${t("help.plural_forms_docs")}
                </a>
              </p>
              <ha-form
                .hass=${this.hass}
                .data=${forms}
                .schema=${pluralForms.map((name) => ({
                  name,
                  selector: { text: { placeholder: forms.other } },
                }))}
                .computeLabel=${pluralLabel}
                @value-changed=${changed}
              ></ha-form>
            `
          )
        : nothing}
    `;
  }

  private _renderUnits() {
    const config = this._config!;
    const alternate: Partial<AlternateUnitConfig> = config.alternate_unit ?? {};
    const primaryForms = toUnitForms(config.unit_of_measurement);
    const alternateForms = toUnitForms(alternate.unit_of_measurement);
    return html`
      ${this._renderPanel(
        t("group.primary_unit"),
        "mdi:counter",
        this._renderUnitFields(
          config.unit_of_measurement,
          t("help.unit_placeholder"),
          (unit) => this._unitChanged(unit)
        ),
        primaryForms.other
      )}
      ${this._renderPanel(
        t("group.alternate_unit"),
        "mdi:scale-balance",
        html`
          ${this._renderUnitFields(
            alternate.unit_of_measurement,
            undefined,
            (unit) =>
              this._alternateChanged({
                ...alternate,
                unit_of_measurement: unit as UnitConfig,
              })
          )}
          <ha-form
            .hass=${this.hass}
            .data=${alternate}
            .schema=${[
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
            ]}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => {
              ev.stopPropagation();
              this._alternateChanged(ev.detail.value);
            }}
          ></ha-form>
        `,
        alternateForms.other && alternate.conversion_factor
          ? `× ${alternate.conversion_factor} ${alternateForms.other}`
          : alternateForms.other
      )}
    `;
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
        <h3>${t("section.device")}</h3>
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
                ${t("help.documentation")}
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
                    ${t("alert.compound_switch")}
                  </ha-alert>`
                : nothing}
            `
          : html`<ha-alert alert-type="warning">
              ${t("alert.unknown_device", "{type}", String(device?.type))}
            </ha-alert>`}
      </div>
      <div class="section">
        <h3>${t("section.display")}</h3>
        <ha-form
          .hass=${this.hass}
          .data=${{ editable: this._config.editable ?? "toggle" }}
          .schema=${this._editableSchema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._editableChanged}
        ></ha-form>
        ${this._renderUnits()}
        <ha-form
          .hass=${this.hass}
          .data=${{ display: this._config.display }}
          .schema=${this._statusSchema()}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._statusChanged}
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
      /* Matches ha-form's own expandable sections. */
      ha-expansion-panel {
        display: block;
        --expansion-panel-content-padding: 0;
        border-radius: var(--ha-border-radius-md, 6px);
        --ha-card-border-radius: var(--ha-border-radius-md, 6px);
      }
      ha-expansion-panel ha-icon {
        color: var(--secondary-text-color);
      }
      .content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
      }
      .content p {
        margin: 0;
        color: var(--secondary-text-color);
      }
      .content a {
        color: var(--primary-color);
      }
    `;
  }
}
