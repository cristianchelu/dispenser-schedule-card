import { html, LitElement, nothing, unsafeCSS } from "lit";
import { STATE_NOT_RUNNING } from "home-assistant-js-websocket";

import { styleMap } from 'lit/directives/style-map.js';
import { customElement } from 'lit/decorators/custom-element.js';

import {
  Device,
  EntryStatus,
  ScheduleEntry,
  EditScheduleEntry
} from "./types/common";

import {
  DefaultDisplayConfig,
  DispenserScheduleCardConfig,
  DisplayConfigEntry,
} from "./types/config";

import localize from "./localization";
import Devices from "./devices";

import DispenserScheduleCardStyles from "./dispenser-schedule-card.css";

const createEntityNotFoundWarning = (
  hass: any,
  entityId?: string
) =>
  hass.config.state !== STATE_NOT_RUNNING
    ? hass.localize("ui.panel.lovelace.warning.entity_not_found", {
      entity: entityId || "[empty]",
    })
    : hass.localize("ui.panel.lovelace.warning.starting");

function getFirstGap(arr: Array<number>) {
  arr.sort((a, b) => a - b);
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== i) {
      return i;
    }
  }
  return arr.length
}

function getNextId(arr: Array<number>) {
  return !arr.length ? 0 : Math.min(getFirstGap(arr), Math.max(...arr) + 1);
}

@customElement('dispenser-schedule-card')
class DispenserScheduleCard extends LitElement {
  declare _config: DispenserScheduleCardConfig;
  declare _hass: any;
  declare _scheduleEntity: any;
  declare _switchEntity: any;
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
      _scheduleEntity: { state: true },
      _switchEntity: { state: true },
      _isEditing: { state: true },
      _isReady: { state: true },
      _schedules: { state: true },
      _editSchedule: { state: true },
    };
  }

  static get styles() {
    return unsafeCSS(DispenserScheduleCardStyles);
  }

  set hass(hass: any) {
    this._hass = hass;
    this._scheduleEntity = hass.states[this._config.entity ?? ""];
    this._switchEntity = hass.states[this._config.switch ?? ""];
    if (this._scheduleEntity) {
      this._schedules = this.parseSchedule();
    }
  }

  handleEditToggle() {
    if (this._isEditing) {
      this._isEditing = false;
    } else {
      this._isEditing = true;
    }
  }

  handleEditEntry(entry: ScheduleEntry) {
    this._editSchedule = entry;
  }

  handleAddEntry() {
    this._editSchedule = {
      id: null,
      hour: 0,
      minute: 0,
      amount: this._device.minAmount,
    };
  }

  handleRemoveEntry(entry: EditScheduleEntry) {
    if (entry.id === null || !this._config.actions?.remove) {
      return;
    }
    const [domain, action] = this._config.actions.remove.split('.');
    this._hass.callService(domain, action, {
      id: entry.id,
    });
  }

  handleToggleEntry(entry: EditScheduleEntry) {
    if (entry.id === null || !this._config.actions?.toggle) {
      return;
    }
    const [domain, action] = this._config.actions.toggle.split('.');
    this._hass.callService(domain, action, {
      id: entry.id,
    });
  }

  handleCancel() {
    this._editSchedule = null;
  }

  handleSaveEntry() {
    const entry = this._editSchedule;
    if (!entry) {
      return;
    }

    const getAmountKey = (domain: string, action: string) => {
      // Backwards compatibility for `portions` field
      return Object.keys(this._hass.services[domain][action].fields)
        .find((k) => ['amount', 'portions'].includes(k)) ?? 'amount';
    }

    if (entry.id === null) {
      if (!this._config.actions?.add) {
        return;
      }
      const id = getNextId(this._schedules.map(e => e.id));
      const [domain, action] = this._config.actions.add.split('.');
      const amountKey = getAmountKey(domain, action);
      this._hass.callService(domain, action, {
        id,
        hour: entry.hour,
        minute: entry.minute,
        [amountKey]: entry.amount,
      });
    } else {
      if (!this._config.actions?.edit) {
        return;
      }
      const [domain, action] = this._config.actions.edit.split('.');
      const amountKey = getAmountKey(domain, action);
      this._hass.callService(domain, action, {
        id: entry.id,
        hour: entry.hour,
        minute: entry.minute,
        [amountKey]: entry.amount,
      });
    }
    this._editSchedule = null;
  }

  async loadComponents() {
    // `ha-time-input` is not available until an entity that uses it is lazily loaded
    // so we need to wait for it to be available before we can enable editing.
    const helpers = await window.loadCardHelpers();

    helpers.createRowElement({ "type": "time-entity" });
    this._isReady = true;
  }

  getDisplayStatus(entry: ScheduleEntry) {
    const { hour, minute, status } = entry;

    const scheduledDate = new Date();
    scheduledDate.setHours(hour, minute);

    if (status === EntryStatus.PENDING) {
      // TODO: Handle case of FE timezone different from device timezone
      const isPastDue = new Date().getTime() > scheduledDate.getTime();
      if (isPastDue) {
        return EntryStatus.SKIPPED;
      }

      if (this._switchEntity?.state === 'off') {
        return EntryStatus.DISABLED;
      }
    }

    return status;
  }

  renderAmount(amount: number) {
    const { alternate_unit } = this._config;

    const main_unit = this._config.unit_of_measurement ?? localize('ui.portions');
    const mainStr = `${amount} ${main_unit}`;

    let alternateStr;
    if (alternate_unit) {
      const { approximate, conversion_factor, unit_of_measurement: alt_unit } = alternate_unit;
      const convertedAmount = amount * conversion_factor;
      alternateStr = `${approximate ? '~' : ''}${convertedAmount} ${alt_unit}`;
    }

    return [mainStr, alternateStr].filter(Boolean).join(' ⸱ ');
  }

  renderScheduleRow(entry: ScheduleEntry) {
    const { hour, minute, amount } = entry;

    const displayStatus = this.getDisplayStatus(entry);

    const { add, ...actions } = this._config.actions || {};
    const hasOverflowActions = Object.keys(actions).length > 0;

    const display: DisplayConfigEntry = this._config.display?.[displayStatus] ?? {};

    const label = display.label ?? displayStatus;
    const statusText = localize(`status.${label}`) ?? label;
    const secondaryText = this.renderAmount(amount);

    return html`<hui-generic-entity-row
        .hass=${this._hass}
        .config=${{
        entity: this._config.entity,
        name: `${hour}:${minute.toString().padStart(2, "0")}`,
        icon: display?.icon ?? DefaultDisplayConfig[displayStatus]?.icon,
      }}
        .catchInteraction=${false}
        .secondaryText="${this._isEditing ? secondaryText : statusText}"
        class="timeline ${displayStatus}"
        style=${styleMap({
        '--paper-item-icon-color': display?.color ?? DefaultDisplayConfig[displayStatus]?.color
      })}
      >
        <div>
          ${!this._isEditing
        ? html`<span>${secondaryText}</span>`
        : nothing
      }
        ${this._isEditing
        ? html`<ha-button-menu class="edit-menu" .disabled=${!hasOverflowActions}>
            <ha-icon-button 
              slot="trigger"
              .disabled=${!hasOverflowActions}
            > 
                <ha-icon icon="mdi:dots-vertical"></ha-icon>
            </ha-icon-button>
            ${!!actions?.edit ? html`<ha-list-item
            @click=${() => this.handleEditEntry(entry)} 
            graphic="icon"
            class="edit-entry"
            hasMeta
          >
            ${this._hass.localize('ui.common.edit')}
            <ha-icon slot="graphic" icon="mdi:pencil"></ha-icon>
          </ha-list-item>` : nothing}
            ${!!actions?.remove ? html`<ha-list-item
            @click=${() => this.handleRemoveEntry(entry)} 
            graphic="icon"
            class="remove-entry"
            hasMeta
          >
            ${this._hass.localize('ui.common.delete')}
            <ha-icon slot="graphic" icon="mdi:delete"></ha-icon>
          </ha-list-item>` : nothing}
             ${!!actions?.toggle ?
            html`<ha-list-item
             @click=${() => this.handleToggleEntry(entry)} 
             graphic="icon"
             class="toggle-entry"
             hasMeta
           >
              ${displayStatus === 'disabled' ? this._hass.localize('ui.common.enable') : this._hass.localize('ui.common.disable')}
             <ha-icon slot="graphic" icon="${displayStatus === 'disabled' ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off'}"></ha-icon>
           </ha-list-item>` : nothing}
          </ha-button-menu>`
        : nothing
      }
        </div>
      </hui-generic-entity-row>`;
  }

  handleTimeChanged(ev: CustomEvent, entry: EditScheduleEntry) {
    const [hour, minute] = ev.detail.value.split(':').map(Number);
    this._editSchedule = { ...entry, hour, minute };
  }

  handleAmountChanged(ev: InputEvent, entry: EditScheduleEntry) {
    const amount = parseInt((ev.target as HTMLInputElement).value);
    this._editSchedule = { ...entry, amount };
  }

  renderSwitch() {
    if (this._config.switch && !this._switchEntity) {
      return html`<ha-alert alert-type="warning">
        ${createEntityNotFoundWarning(this._hass, this._config.switch)}
      </ha-alert>`;
    }

    const isAddDisabled = this._schedules.length >= this._device.maxEntries;

    const switchElement = this._switchEntity
      ? html`<ha-entity-toggle 
          .hass=${this._hass}
          .stateObj=${this._switchEntity}
        ></ha-entity-toggle>`
      : nothing;

    return html`
      <hui-generic-entity-row
        .hass=${this._hass}
        .catchInteraction=${false}
        .config=${{
        entity: this._switchEntity ? this._config.switch : this._config.entity,
        name: localize('ui.name'),
        icon: this._switchEntity ? this._switchEntity.attributes.icon : 'mdi:calendar-badge',
        state_color: true,
      }}
        class="timeline"
      >
        ${this._config.editable === "toggle"
        ? html`<mwc-button 
            @click=${this.handleEditToggle} 
            class='edit-button'
          >
            ${this._hass.localize(this._isEditing ? "ui.sidebar.done" : 'ui.common.edit')}
          </mwc-button>`
        : nothing}
        ${this._isEditing
        ? html`<ha-icon-button 
            ?disabled=${isAddDisabled || !this._config.actions?.add}
            @click=${this.handleAddEntry}
            class='add-entry'
          >
            <ha-icon icon="mdi:clock-plus"></ha-icon>
          </ha-icon-button>`
        : switchElement}
      </hui-generic-entity-row>`;
  }

  parseSchedule() {
    return this._device.getSchedule(this._scheduleEntity.state);
  }

  isSaveDisabled(entry: EditScheduleEntry) {
    if (entry.id === null) {
      return entry.hour < 0 || entry.hour > 23
        || entry.minute < 0 || entry.minute > 59
        || entry.amount < this._device.minAmount || entry.amount > this._device.maxAmount;
    } else {
      const schedule = this._schedules.find(e => e.id === entry.id);
      return schedule?.hour === entry.hour
        && schedule?.minute === entry.minute
        && schedule?.amount === entry.amount;
    }
  }

  renderContent() {
    if (this._config.entity && !this._scheduleEntity) {
      html`<ha-alert alert-type="warning">
        ${createEntityNotFoundWarning(this._hass, this._config.entity)}
      </ha-alert>`;
    }

    if (this._editSchedule) {
      const entry = this._editSchedule;
      const spacerHeight = Math.max(this._schedules.length - 1, 0) * (40 + 8) - 24;
      return html`
        <ha-control-button-group>
          <mwc-button
            @click=${this.handleCancel}
            class='cancel-button'
          >
            ${this._hass.localize('ui.common.cancel')}
          </mwc-button>
          <mwc-button
            @click=${this.handleSaveEntry}
            class='save-button'
            ?disabled=${this.isSaveDisabled(entry)}
          >
            ${this._hass.localize('ui.common.save')}
          </mwc-button>
        </ha-control-button-group>
          <div class="edit-row">
            <ha-time-input
              .value=${`${entry.hour}:${entry.minute.toString().padStart(2, "0")}`}
              .locale=${this._hass.locale}
              @value-changed=${(ev: CustomEvent) => this.handleTimeChanged(ev, entry)}
            ></ha-time-input>
            <ha-textfield 
              .value=${entry.amount} 
              type="number" 
              no-spinner 
              label=${this._config.unit_of_measurement ?? localize('ui.amount')}
              max=${this._device.maxAmount}
              min=${this._device.minAmount}
              @change=${(ev: InputEvent) => this.handleAmountChanged(ev, entry)}
            ></ha-textfield>
          </div>
          <div class='edit-row-spacer' style="flex-basis: ${spacerHeight}px"></div>
        `
    }

    if (this._schedules.length === 0) {
      const label = this._scheduleEntity?.state === 'unavailable'
        ? this._hass.localize('state.default.unavailable')
        : localize('ui.empty');

      return html`<hui-generic-entity-row
      class="empty-row"
      .hass=${this._hass}
      .config=${{
          entity: this._config.entity,
          name: label,
          icon: 'mdi:calendar-blank-outline',
        }}></hui-generic-entity-row>`;
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

  setConfig(config: DispenserScheduleCardConfig<unknown>) {
    let editable = config.editable ?? "toggle";
    const deviceType = config.device?.type ?? 'xiaomi-smart-feeder';

    if (editable === "always") {
      this._isEditing = true;
    } else if (editable === "never") {
      this._isEditing = false;
    } else if (editable !== "toggle") {
      throw new Error(`Invalid editable option: ${editable}`);
    }

    const actions = config.actions || {};
    if (Object.keys(actions).length === 0) {
      editable = "never";
      this._isEditing = false;
    }

    this._config = {
      ...config,
      editable,
    };

    this._device = new Devices[deviceType](this._config, this._hass);
  }
}