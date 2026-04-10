import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { DeviceConfig, XiaomiSmartFeederDeviceConfig } from "../devices";
import type { DispenserScheduleCardConfig } from "../types/config";
import type { HomeAssistant } from "../types/ha";
import { EntryStatus } from "../types/common";
import {
  coerceCardConfigForEditor,
  LOVELACE_CARD_TYPE,
  normalizeDeviceType,
} from "./coerce-card-config";
import {
  defaultDeviceForPreset,
  DEVICE_PRESET_LABELS,
  type UiDevicePreset,
  UI_DEVICE_PRESETS,
} from "./device-presets";

const DISPLAY_STATUSES: EntryStatus[] = [
  EntryStatus.DISPENSED,
  EntryStatus.FAILED,
  EntryStatus.DISPENSING,
  EntryStatus.PENDING,
  EntryStatus.SKIPPED,
  EntryStatus.DISABLED,
  EntryStatus.NONE,
];

function isPluralObject(
  v: string | Record<string, string | undefined> | undefined
): v is Record<string, string | undefined> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type ResolvedDeviceKind =
  | "custom"
  | "xiaomi-smart-feeder-2"
  | "xiaomi-smart-feeder"
  | "unknown";

function resolveDeviceKind(
  device: DeviceConfig | undefined
): ResolvedDeviceKind {
  const t = normalizeDeviceType(device?.type);
  if (t === "custom") return "custom";
  if (t === "xiaomi-smart-feeder-2") return "xiaomi-smart-feeder-2";
  if (t === "xiaomi-smart-feeder") return "xiaomi-smart-feeder";
  return "unknown";
}

function stubEditorConfig(): DispenserScheduleCardConfig {
  return coerceCardConfigForEditor(undefined);
}

@customElement("dispenser-schedule-card-editor")
export class DispenserScheduleCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  /** HA may run an initial render before `setConfig` is called. */
  @state() private _config: DispenserScheduleCardConfig = stubEditorConfig();

  static styles = css`
    :host {
      display: block;
      padding: 8px 0;
    }
    .section {
      margin-bottom: 16px;
      padding: 12px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
    }
    .section-title {
      font-weight: 600;
      margin-bottom: 12px;
      display: block;
    }
    .field {
      margin-top: 12px;
    }
    .field:first-of-type {
      margin-top: 0;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.85em;
      margin-top: 8px;
    }
    .readonly {
      color: var(--secondary-text-color);
    }
    ha-textfield {
      display: block;
      width: 100%;
    }
    select.native-select {
      display: block;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      margin-top: 4px;
      font-size: 14px;
      font-family: inherit;
      line-height: 1.4;
      color: var(--primary-text-color);
      background-color: var(
        --card-background-color,
        var(--secondary-background-color)
      );
      border: 1px solid var(--outline-color);
      border-radius: 4px;
    }
    .field-label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    .status-grid {
      display: grid;
      gap: 8px;
      margin-top: 8px;
    }
    .status-row {
      border-top: 1px solid var(--divider-color);
      padding-top: 8px;
    }
    .status-name {
      font-size: 0.9em;
      margin-bottom: 6px;
      text-transform: capitalize;
    }
  `;

  setConfig(config: DispenserScheduleCardConfig | undefined) {
    this._config = coerceCardConfigForEditor(config);
  }

  private _fireConfig(config: DispenserScheduleCardConfig) {
    this._config = config;
    const payload = { ...config, type: LOVELACE_CARD_TYPE };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: payload },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _mergeConfig(patch: Partial<DispenserScheduleCardConfig>) {
    this._fireConfig({ ...this._config, ...patch });
  }

  private _isCustomDevice(): boolean {
    return resolveDeviceKind(this._config?.device) === "custom";
  }

  private _presetNativeChange(ev: Event) {
    if (this._isCustomDevice()) return;
    const type = (ev.target as HTMLSelectElement).value as UiDevicePreset;
    if (!type || !UI_DEVICE_PRESETS.includes(type)) return;
    if (normalizeDeviceType(this._config.device.type) === type) return;
    this._mergeConfig({ device: defaultDeviceForPreset(type) });
  }

  private _entityTextInput(path: "entity" | "switch", ev: Event) {
    const value = (ev.target as HTMLInputElement).value?.trim() ?? "";
    const device = this._config.device;
    if (normalizeDeviceType(device.type) === "custom") return;
    if (path === "entity") {
      this._mergeConfig({
        device: { ...device, entity: value } as DeviceConfig,
      });
    } else {
      this._mergeConfig({
        device: {
          ...device,
          switch: value.length > 0 ? value : undefined,
        } as DeviceConfig,
      });
    }
  }

  private _actionChanged(key: "add" | "edit" | "remove" | "toggle", ev: Event) {
    const device = this._config.device;
    if (normalizeDeviceType(device.type) !== "xiaomi-smart-feeder") return;
    const xf = device as XiaomiSmartFeederDeviceConfig;
    const value = (ev.target as HTMLInputElement).value?.trim() || undefined;
    const actions = { ...xf.actions, [key]: value };
    Object.keys(actions).forEach((k) => {
      if (actions[k as keyof typeof actions] === undefined) {
        delete actions[k as keyof typeof actions];
      }
    });
    this._mergeConfig({
      device: {
        ...xf,
        actions: Object.keys(actions).length ? actions : undefined,
      } as DeviceConfig,
    });
  }

  private _editableNativeChange(ev: Event) {
    const v = (ev.target as HTMLSelectElement)
      .value as DispenserScheduleCardConfig["editable"];
    if (v !== "always" && v !== "never" && v !== "toggle") return;
    this._mergeConfig({ editable: v });
  }

  private _unitStringChanged(ev: Event) {
    const value = (ev.target as HTMLInputElement).value;
    this._mergeConfig({ unit_of_measurement: value || undefined });
  }

  private _altApproximateChanged(ev: Event) {
    const alt = this._config.alternate_unit;
    if (!alt || isPluralObject(alt.unit_of_measurement)) return;
    const checked = (ev.currentTarget as HTMLElement & { checked: boolean })
      .checked;
    this._mergeConfig({
      alternate_unit: { ...alt, approximate: checked },
    });
  }

  private _altUnitChanged(
    field: "unit_of_measurement" | "conversion_factor",
    ev: Event
  ) {
    const alt = this._config.alternate_unit;
    if (!alt || isPluralObject(alt.unit_of_measurement)) return;

    if (field === "conversion_factor") {
      const n = parseFloat((ev.target as HTMLInputElement).value);
      this._mergeConfig({
        alternate_unit: {
          ...alt,
          conversion_factor: Number.isFinite(n) ? n : alt.conversion_factor,
        },
      });
      return;
    }

    const str = (ev.target as HTMLInputElement).value;
    this._mergeConfig({
      alternate_unit: {
        ...alt,
        unit_of_measurement: str || "",
      },
    });
  }

  private _toggleAlternateUnit(ev: Event) {
    const on = (ev.currentTarget as HTMLElement & { checked: boolean }).checked;
    if (on) {
      this._mergeConfig({
        alternate_unit: {
          unit_of_measurement: "",
          conversion_factor: 1,
          approximate: false,
        },
      });
    } else {
      const { alternate_unit: _a, ...rest } = this._config;
      this._fireConfig(rest as DispenserScheduleCardConfig);
    }
  }

  private _displayFieldChanged(
    status: EntryStatus,
    field: "icon" | "color" | "label",
    ev: Event
  ) {
    const raw = (ev.target as HTMLInputElement).value;
    const value = raw?.trim() ?? "";
    const prev = this._config.display?.[status] ?? {};
    const nextEntry = { ...prev, [field]: value || undefined };
    if (!nextEntry.icon && !nextEntry.color && !nextEntry.label) {
      const display = { ...this._config.display };
      delete display[status];
      this._mergeConfig({
        display: Object.keys(display).length ? display : undefined,
      });
      return;
    }
    this._mergeConfig({
      display: {
        ...this._config.display,
        [status]: nextEntry,
      },
    });
  }

  private _renderPart1() {
    if (this._isCustomDevice()) {
      return html`
        <span class="section-title">1. Device type</span>
        <p class="readonly">Custom device (YAML only)</p>
        <p class="hint">
          Switching device type from the UI is not supported for custom devices.
          Edit <code>device:</code> in YAML.
        </p>
      `;
    }

    const current = this._config.device.type as UiDevicePreset;

    return html`
      <span class="section-title">1. Device type</span>
      <span class="field-label">Device profile</span>
      <select
        class="native-select"
        aria-label="Device profile"
        .value=${current}
        @change=${this._presetNativeChange}
      >
        ${UI_DEVICE_PRESETS.map(
          (p) => html`<option value=${p}>${DEVICE_PRESET_LABELS[p]}</option>`
        )}
      </select>
    `;
  }

  private _renderPart2() {
    if (this._isCustomDevice()) {
      return html`
        <span class="section-title">2. Device configuration</span>
        <p class="readonly">This device type can only be configured in YAML.</p>
      `;
    }

    const device = this._config.device;
    const kind = resolveDeviceKind(device);

    if (kind === "xiaomi-smart-feeder-2") {
      return html`
        <span class="section-title">2. Device configuration</span>
        <div class="field">
          <ha-textfield
            label="Schedule entity ID"
            helper="text.* entity (schedule is read/written as text state)"
            .value=${device.entity}
            @input=${(ev: Event) => this._entityTextInput("entity", ev)}
          ></ha-textfield>
        </div>
      `;
    }

    if (kind === "xiaomi-smart-feeder") {
      const d = device as XiaomiSmartFeederDeviceConfig;
      const actions = d.actions ?? {};
      return html`
        <span class="section-title">2. Device configuration</span>
        <div class="field">
          <ha-textfield
            label="Schedule entity ID"
            helper="Entity whose state holds the raw schedule (e.g. sensor.* or input_text.*)"
            .value=${d.entity}
            @input=${(ev: Event) => this._entityTextInput("entity", ev)}
          ></ha-textfield>
        </div>
        <div class="field">
          <ha-textfield
            label="Schedule enable entity ID (optional)"
            helper="switch.*, input_boolean.*, or other toggle entity"
            .value=${d.switch ?? ""}
            @input=${(ev: Event) => this._entityTextInput("switch", ev)}
          ></ha-textfield>
        </div>
        <p class="hint">ESPHome / service actions (optional)</p>
        ${(
          [
            ["add", "Add entry"],
            ["edit", "Edit entry"],
            ["remove", "Remove entry"],
            ["toggle", "Toggle entry"],
          ] as const
        ).map(
          ([key, label]) => html`
            <div class="field">
              <ha-textfield
                .label=${label}
                .value=${actions[key] ?? ""}
                placeholder="domain.service"
                @input=${(ev: Event) => this._actionChanged(key, ev)}
              ></ha-textfield>
            </div>
          `
        )}
      `;
    }

    return html`
      <span class="section-title">2. Device configuration</span>
      <p class="readonly">
        Unknown device type
        <code>${normalizeDeviceType(device?.type)}</code>. Edit
        <code>device:</code> in YAML or pick a supported profile in section 1.
      </p>
    `;
  }

  private _renderPart3() {
    const editable = this._config.editable ?? "toggle";
    const unitPlural = isPluralObject(this._config.unit_of_measurement);
    const alt = this._config.alternate_unit;
    const altUnitPlural = alt && isPluralObject(alt.unit_of_measurement);

    return html`
      <span class="section-title">3. Display and behavior</span>
      <div class="field">
        <span class="field-label">Editable schedule</span>
        <select
          class="native-select"
          aria-label="Editable schedule"
          .value=${editable}
          @change=${this._editableNativeChange}
        >
          <option value="toggle">Toggle in header</option>
          <option value="always">Always</option>
          <option value="never">Never</option>
        </select>
      </div>

      <div class="field">
        ${unitPlural
          ? html`<p class="hint">
              Primary unit uses pluralization objects — edit
              <code>unit_of_measurement</code> in YAML.
            </p>`
          : html`
              <ha-textfield
                label="Unit label (e.g. portions)"
                .value=${typeof this._config.unit_of_measurement === "string"
                  ? this._config.unit_of_measurement
                  : ""}
                @input=${this._unitStringChanged}
              ></ha-textfield>
            `}
      </div>

      <div class="field">
        <ha-formfield .label=${"Enable alternate unit"}>
          <ha-switch
            .checked=${!!alt}
            @change=${this._toggleAlternateUnit}
          ></ha-switch>
        </ha-formfield>
        ${alt && altUnitPlural
          ? html`<p class="hint">
              Alternate unit uses pluralization — edit
              <code>alternate_unit</code> in YAML.
            </p>`
          : alt
            ? html`
                <ha-textfield
                  class="field"
                  label="Alternate unit label"
                  .value=${typeof alt.unit_of_measurement === "string"
                    ? alt.unit_of_measurement
                    : ""}
                  @input=${(ev: Event) =>
                    this._altUnitChanged("unit_of_measurement", ev)}
                ></ha-textfield>
                <ha-textfield
                  class="field"
                  label="Conversion factor"
                  type="number"
                  .value=${String(alt.conversion_factor)}
                  @input=${(ev: Event) =>
                    this._altUnitChanged("conversion_factor", ev)}
                ></ha-textfield>
                <ha-formfield class="field" .label=${"Approximate (~)"}>
                  <ha-switch
                    .checked=${!!alt.approximate}
                    @change=${this._altApproximateChanged}
                  ></ha-switch>
                </ha-formfield>
              `
            : nothing}
      </div>

      <p class="hint">
        Status appearance (icons, colors, labels). Custom status keys from YAML
        are preserved but not listed here.
      </p>
      <div class="status-grid">
        ${DISPLAY_STATUSES.map((status) => {
          const row = this._config.display?.[status] ?? {};
          return html`
            <div class="status-row">
              <div class="status-name">${status}</div>
              <ha-textfield
                label="Icon"
                .value=${row.icon ?? ""}
                placeholder="mdi:check"
                @input=${(ev: Event) =>
                  this._displayFieldChanged(status, "icon", ev)}
              ></ha-textfield>
              <ha-textfield
                class="field"
                label="Color (CSS)"
                .value=${row.color ?? ""}
                placeholder="var(--state-active-color)"
                @input=${(ev: Event) =>
                  this._displayFieldChanged(status, "color", ev)}
              ></ha-textfield>
              <ha-textfield
                class="field"
                label="Label override"
                .value=${row.label ?? ""}
                @input=${(ev: Event) =>
                  this._displayFieldChanged(status, "label", ev)}
              ></ha-textfield>
            </div>
          `;
        })}
      </div>
    `;
  }

  protected render() {
    return html`
      <div class="sections">
        <div class="section">${this._renderPart1()}</div>
        <div class="section">${this._renderPart2()}</div>
        <div class="section">${this._renderPart3()}</div>
      </div>
    `;
  }
}
