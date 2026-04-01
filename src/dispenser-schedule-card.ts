import { html, LitElement, nothing, unsafeCSS } from "lit";
import { STATE_NOT_RUNNING } from "home-assistant-js-websocket";

import { styleMap } from "lit/directives/style-map.js";
import { customElement } from "lit/decorators/custom-element.js";

import {
  Device,
  EntryStatus,
  ScheduleEntry,
  EditScheduleEntry,
} from "./types/common";

import {
  DefaultDisplayConfig,
  DispenserScheduleCardConfig,
  DisplayConfigEntry,
} from "./types/config";

import type { HomeAssistant } from "./types/ha";
import localize from "./localization";
import { createDevice } from "./devices";

import DispenserScheduleCardStyles from "./dispenser-schedule-card.css";

const createEntityNotFoundWarning = (hass: HomeAssistant, entityId?: string) =>
  hass.config.state !== STATE_NOT_RUNNING
    ? hass.localize("ui.panel.lovelace.warning.entity_not_found", {
        entity: entityId || "[empty]",
      })
    : hass.localize("ui.panel.lovelace.warning.starting");

@customElement("dispenser-schedule-card")
class DispenserScheduleCard extends LitElement {
  declare _config: DispenserScheduleCardConfig;
  declare _hass: HomeAssistant;
  declare _isEditing: boolean;
  declare _isReady: boolean;
  declare _schedules: Array<ScheduleEntry>;
  declare _editSchedule: EditScheduleEntry | null;
  declare _device: Device;

  constructor() {
    super();
    this._isReady = false;
    this._schedules = [];
    this._editSchedule = null;
  }

  static get properties() {
    return {
      _config: { state: true },
      _isEditing: { state: true },
      _isReady: { state: true },
      _schedules: { state: true },
      _editSchedule: { state: true },
    };
  }

  static get styles() {
    return unsafeCSS(DispenserScheduleCardStyles);
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._device) {
      this._device.updateHass(hass);
      this._schedules = this._device.getSchedule();
    }
  }

  handleEditToggle() {
    this._isEditing = !this._isEditing;
  }

  handleEditEntry(entry: ScheduleEntry) {
    this._editSchedule = entry;
  }

  handleAddEntry() {
    this._editSchedule = this._device.getNewEntryDefaults();
  }

  handleRemoveEntry(entry: ScheduleEntry) {
    this._device.removeEntry(entry);
  }

  handleToggleEntry(entry: ScheduleEntry) {
    this._device.toggleEntry(entry);
  }

  _handleRowMenuAction(entry: ScheduleEntry, ev: CustomEvent) {
    switch (ev.detail?.item?.value) {
      case "edit":
        this.handleEditEntry(entry);
        break;
      case "remove":
        this.handleRemoveEntry(entry);
        break;
      case "toggle":
        this.handleToggleEntry(entry);
        break;
    }
  }

  handleCancel() {
    this._editSchedule = null;
  }

  async handleSaveEntry() {
    const entry = this._editSchedule;
    if (!entry) return;

    if (entry.key === null) {
      await this._device.addEntry(entry);
    } else {
      await this._device.editEntry(entry);
    }
    this._editSchedule = null;
  }

  /**
   * Hack to force lazy-load ha-time-input, which isn't available until a
   * HA entity row that uses it is created.
   */
  async loadComponents() {
    const helpers = await window.loadCardHelpers();
    helpers.createRowElement({ type: "time-entity" });
    this._isReady = true;
  }

  renderAmount(amount: number) {
    const { alternate_unit } = this._config;

    let pluralCategory: Intl.LDMLPluralRule = "other";
    try {
      const pluralRules = new Intl.PluralRules(this._hass.locale.language, {
        type: "cardinal",
      });
      pluralCategory = pluralRules.select(amount);
    } catch (_error) {}

    let main_unit: string;
    const unitConfig = this._config.unit_of_measurement;
    if (typeof unitConfig === "object" && unitConfig !== null) {
      main_unit = unitConfig[pluralCategory] ?? unitConfig.other ?? "portions";
    } else if (typeof unitConfig === "string") {
      main_unit = unitConfig;
    } else {
      main_unit = localize(`ui.portions_${pluralCategory}`) ?? "portions";
    }
    const mainStr = `${amount} ${main_unit}`;

    let alternateStr;
    if (alternate_unit) {
      const {
        approximate,
        conversion_factor,
        unit_of_measurement: alt_unit,
      } = alternate_unit;
      const convertedAmount = amount * conversion_factor;

      let alt_unit_display: string;
      if (typeof alt_unit === "object" && alt_unit !== null) {
        alt_unit_display = alt_unit[pluralCategory] ?? alt_unit.other ?? "";
      } else {
        alt_unit_display = alt_unit;
      }

      alternateStr = `${approximate ? "~" : ""}${convertedAmount} ${alt_unit_display}`;
    }

    return [mainStr, alternateStr].filter(Boolean).join(" ⸱ ");
  }

  renderScheduleRow(entry: ScheduleEntry) {
    const { hour, minute, amount } = entry;
    const displayStatus = this._device.getDisplayStatus(entry);
    const caps = this._device.capabilities;
    const hasOverflowActions =
      caps.canEditEntries || caps.canRemoveEntries || caps.hasEntryToggle;

    const display: DisplayConfigEntry =
      this._config.display?.[displayStatus] ?? {};

    const label = display.label ?? displayStatus;
    const statusText =
      displayStatus === EntryStatus.NONE
        ? ""
        : (localize(`status.${label}`) ?? label);
    const secondaryText = this.renderAmount(amount);

    const displayEntityId = this._device.getDisplayEntity();
    const color =
      display?.color || DefaultDisplayConfig[displayStatus]?.color || undefined;

    return html`<hui-generic-entity-row
      .hass=${this._hass}
      .config=${{
        entity: displayEntityId,
        name: `${hour}:${minute.toString().padStart(2, "0")}`,
        icon: display?.icon ?? DefaultDisplayConfig[displayStatus]?.icon,
      }}
      .catchInteraction=${false}
      .secondaryText="${this._isEditing ? secondaryText : statusText}"
      class="timeline ${displayStatus}"
      style=${styleMap({
        "--state-icon-color": color, // >= HA2025.5
        "--paper-item-icon-color": color, // < HA2025.5
      })}
    >
      <div>
        ${!this._isEditing ? html`<span>${secondaryText}</span>` : nothing}
        ${this._isEditing && hasOverflowActions
          ? html`<ha-dropdown
              class="edit-menu"
              @wa-select=${(ev: CustomEvent) =>
                this._handleRowMenuAction(entry, ev)}
            >
              <ha-icon-button slot="trigger">
                <ha-icon icon="mdi:dots-vertical"></ha-icon>
              </ha-icon-button>
              ${caps.canEditEntries
                ? html`<ha-dropdown-item value="edit" class="edit-entry">
                    ${localize("ui.edit")}
                    <ha-icon slot="icon" icon="mdi:pencil"></ha-icon>
                  </ha-dropdown-item>`
                : nothing}
              ${caps.canRemoveEntries
                ? html`<ha-dropdown-item value="remove" class="remove-entry">
                    ${localize("ui.delete")}
                    <ha-icon slot="icon" icon="mdi:delete"></ha-icon>
                  </ha-dropdown-item>`
                : nothing}
              ${caps.hasEntryToggle
                ? html`<ha-dropdown-item value="toggle" class="toggle-entry">
                    ${displayStatus === EntryStatus.DISABLED
                      ? localize("ui.enable")
                      : localize("ui.disable")}
                    <ha-icon
                      slot="icon"
                      icon="${displayStatus === EntryStatus.DISABLED
                        ? "mdi:toggle-switch"
                        : "mdi:toggle-switch-off"}"
                    ></ha-icon>
                  </ha-dropdown-item>`
                : nothing}
            </ha-dropdown>`
          : nothing}
      </div>
    </hui-generic-entity-row>`;
  }

  handleTimeChanged(ev: CustomEvent, entry: EditScheduleEntry) {
    const [hour, minute] = ev.detail.value.split(":").map(Number);
    this._editSchedule = { ...entry, hour, minute };
  }

  handleAmountChanged(ev: InputEvent, entry: EditScheduleEntry) {
    const amount = parseInt((ev.target as HTMLInputElement).value);
    this._editSchedule = { ...entry, amount };
  }

  renderSwitch() {
    const displayEntityId = this._device.getDisplayEntity();
    const displayInfo = this._device.getDisplayInfo();
    const globalToggle = this._device.getGlobalToggle();

    if (!this._hass.states[displayEntityId]) {
      return html`<ha-alert alert-type="warning">
        ${createEntityNotFoundWarning(this._hass, displayEntityId)}
      </ha-alert>`;
    }

    const caps = this._device.capabilities;
    const isAddDisabled = this._schedules.length >= caps.maxEntries;

    const switchElement = globalToggle
      ? html`<ha-switch
          .checked=${globalToggle.state}
          @change=${(ev: Event) =>
            this._device.setGlobalToggle(
              (ev.target as HTMLInputElement).checked
            )}
        ></ha-switch>`
      : nothing;

    return html`<hui-generic-entity-row
      .hass=${this._hass}
      .catchInteraction=${false}
      .config=${{
        entity: displayEntityId,
        name: localize("ui.name"),
        icon: displayInfo.icon ?? "mdi:calendar-badge",
        state_color: true,
      }}
      class="timeline"
    >
      ${this._config.editable === "toggle"
        ? html`<ha-button
            @click=${this.handleEditToggle}
            class="edit-button"
            appearance="plain"
          >
            ${this._isEditing ? localize("ui.done") : localize("ui.edit")}
          </ha-button>`
        : nothing}
      ${this._isEditing
        ? html`<ha-icon-button
            ?disabled=${isAddDisabled || !caps.canAddEntries}
            @click=${this.handleAddEntry}
            class="add-entry"
          >
            <ha-icon icon="mdi:clock-plus"></ha-icon>
          </ha-icon-button>`
        : switchElement}
    </hui-generic-entity-row>`;
  }

  isSaveDisabled(entry: EditScheduleEntry) {
    const amountConfig = this._device.amountConfig;

    if (entry.key === null) {
      const amountInvalid =
        entry.amount < amountConfig.min || entry.amount > amountConfig.max;
      return (
        entry.hour < 0 ||
        entry.hour > 23 ||
        entry.minute < 0 ||
        entry.minute > 59 ||
        amountInvalid
      );
    } else {
      const schedule = this._schedules.find((e) => e.key === entry.key);
      return (
        schedule?.hour === entry.hour &&
        schedule?.minute === entry.minute &&
        schedule?.amount === entry.amount
      );
    }
  }

  renderContent() {
    const displayEntityId = this._device.getDisplayEntity();

    if (!this._device.isAvailable()) {
      const scheduleEntity =
        this._hass.states[this._device.getWatchedEntities()[0]];
      if (!scheduleEntity) {
        return html`<ha-alert alert-type="warning">
          ${createEntityNotFoundWarning(this._hass, displayEntityId)}
        </ha-alert>`;
      }
    }

    if (this._editSchedule) {
      const entry = this._editSchedule;
      const spacerHeight =
        Math.max(this._schedules.length - 1, 0) * (40 + 8) - 24;
      const amountConfig = this._device.amountConfig;
      const uom = this._config.unit_of_measurement;
      const amountFieldLabel =
        (typeof uom === "object" && uom !== null ? uom.other : uom) ??
        localize("ui.amount") ??
        "";

      return html`
        <ha-control-button-group>
          <ha-button @click=${this.handleCancel} class="cancel-button">
            ${localize("ui.cancel")}
          </ha-button>
          <ha-button
            @click=${this.handleSaveEntry}
            class="save-button"
            ?disabled=${this.isSaveDisabled(entry)}
          >
            ${localize("ui.save")}
          </ha-button>
        </ha-control-button-group>
        <div class="edit-row">
          <ha-time-input
            .value=${`${entry.hour}:${entry.minute.toString().padStart(2, "0")}`}
            .locale=${this._hass.locale}
            @value-changed=${(ev: CustomEvent) =>
              this.handleTimeChanged(ev, entry)}
          ></ha-time-input>
          <ha-textfield
            .value=${entry.amount}
            type="number"
            no-spinner
            label=${amountFieldLabel}
            max=${amountConfig.max}
            min=${amountConfig.min}
            @change=${(ev: InputEvent) => this.handleAmountChanged(ev, entry)}
          ></ha-textfield>
        </div>
        <div
          class="edit-row-spacer"
          style="flex-basis: ${spacerHeight}px"
        ></div>
      `;
    }

    if (this._schedules.length === 0) {
      const available = this._device.isAvailable();
      const label = !available
        ? this._hass.localize("state.default.unavailable")
        : localize("ui.empty");

      return html`<hui-generic-entity-row
        class="empty-row"
        .hass=${this._hass}
        .config=${{
          entity: displayEntityId,
          name: label,
          icon: "mdi:calendar-blank-outline",
        }}
      ></hui-generic-entity-row>`;
    }
    return this._schedules.map(this.renderScheduleRow, this);
  }

  render() {
    if (!this._isReady) {
      void this.loadComponents();
      return nothing;
    }

    if (!this._hass) {
      return nothing;
    }
    return html`
      <ha-card>
        <div class="card-content">
          ${this._editSchedule ? nothing : this.renderSwitch()}
          ${this.renderContent()}
        </div>
      </ha-card>
    `;
  }

  getCardSize(): number {
    return this._schedules ? 1 + this._schedules.length : 3;
  }

  setConfig(config: DispenserScheduleCardConfig) {
    if (!config.device?.type) {
      throw new Error("Missing required 'device.type' in card configuration");
    }

    let editable = config.editable ?? "toggle";

    if (editable === "always") {
      this._isEditing = true;
    } else if (editable === "never") {
      this._isEditing = false;
    } else if (editable !== "toggle") {
      throw new Error(`Invalid editable option: ${editable}`);
    }

    this._device = createDevice(config.device, this._hass);

    const caps = this._device.capabilities;
    const hasAnyEditAction =
      caps.canAddEntries ||
      caps.canEditEntries ||
      caps.canRemoveEntries ||
      caps.hasEntryToggle;

    if (!hasAnyEditAction) {
      editable = "never";
      this._isEditing = false;
    }

    this._config = { ...config, editable };
  }
}
