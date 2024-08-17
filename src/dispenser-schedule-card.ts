import { html, LitElement, nothing, unsafeCSS } from "lit";
import { customElement } from 'lit/decorators/custom-element.js';

import DispenserScheduleCardStyles from "./dispenser-schedule-card.css";
import localize from "./localization";
import { STATE_NOT_RUNNING } from "home-assistant-js-websocket";

interface DispenserScheduleCardConfig {
  entity: string;
  switch?: string;
  actions?: {
    add: string;
    edit: string;
    remove: string;
  };
  editable?: "always" | "toggle" | "never";
  unit_of_measurement?: string;
  alternate_unit?: {
    unit_of_measurement: string;
    conversion_factor: number;
    approximate?: boolean;
  };
}

/** Schedule */
enum SCHEDULE_STATUS {
  /** Schedule triggered successfully */
  DISPENSED = 0,
  /** Schedule failed */
  FAILED = 1,
  /** Currently dispensing portions */
  DISPENSING = 254,
  /** Schedule not yet triggered */
  PENDING = 255,
  /** Schedule was skipped for today */
  SKIPPED = 256, // TODO: Remove from here
};

/** Labels for each schedule status */
const SCHEDULE_LABEL = {
  [SCHEDULE_STATUS.DISPENSED]: "dispensed",
  [SCHEDULE_STATUS.FAILED]: "failed",
  [SCHEDULE_STATUS.DISPENSING]: "dispensing",
  [SCHEDULE_STATUS.PENDING]: "pending",
  [SCHEDULE_STATUS.SKIPPED]: "skipped",
} as const;

/** Icons for each schedule status */
const SCHEDULE_ICONS: Record<SCHEDULE_STATUS, string> = {
  [SCHEDULE_STATUS.DISPENSED]: 'mdi:check',
  [SCHEDULE_STATUS.FAILED]: 'mdi:close',
  [SCHEDULE_STATUS.DISPENSING]: 'mdi:tray-arrow-down',
  [SCHEDULE_STATUS.PENDING]: 'mdi:clock-outline',
  [SCHEDULE_STATUS.SKIPPED]: 'mdi:calendar-clock-outline',
} as const;

const GRAMS_PER_PORTION = 5;
const MAX_ENTRIES = 10;
const MAX_PORTIONS = 30;
const pattern =
  /(?<id>[0-9]),(?<hour>[0-9]{1,3}),(?<minute>[0-9]{1,3}),(?<portions>[0-9]{1,3}),(?<status>[0-9]{1,3}),?/g;

interface ScheduleEntry {
  id: number;
  hour: number;
  minute: number;
  portions: number;
  status: SCHEDULE_STATUS;
}

interface EditScheduleEntry {
  id: number | null;
  hour: number;
  minute: number;
  portions: number;
}

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
  return Math.min(getFirstGap(arr), Math.max(...arr) + 1);
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
      portions: 1,
    };
  }

  handleRemoveEntry(entry: EditScheduleEntry) {
    if (!entry.id || !this._config.actions?.remove) {
      return;
    }
    const [domain, action] = this._config.actions.remove.split('.');
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

    if (entry.id === null) {
      if (!this._config.actions?.add) {
        return;
      }
      const id = getNextId(this._schedules.map(e => e.id));
      const [domain, action] = this._config.actions.add.split('.');
      this._hass.callService(domain, action, {
        id,
        hour: entry.hour,
        minute: entry.minute,
        portions: entry.portions,
      });
    } else {
      if (!this._config.actions?.edit) {
        return;
      }
      const [domain, action] = this._config.actions.edit.split('.');
      this._hass.callService(domain, action, {
        id: entry.id,
        hour: entry.hour,
        minute: entry.minute,
        portions: entry.portions,
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

  renderScheduleRow(schedule: ScheduleEntry) {
    const { id, hour, minute, portions, status } = schedule;

    const scheduledDate = new Date();
    scheduledDate.setHours(hour, minute);

    // TODO: Handle case of FE timezone different from device timezone
    const isPastDue = new Date().getTime() > scheduledDate.getTime();
    const isSkipped = isPastDue && status == SCHEDULE_STATUS.PENDING;
    const displayStatus = isSkipped ? SCHEDULE_STATUS.SKIPPED : status;
    const statusText = localize(`status.${SCHEDULE_LABEL[displayStatus]}`);
    const secondaryText = this.renderAmount(portions);

    return html`<hui-generic-entity-row
        .hass=${this._hass}
        .config=${{
        entity: this._config.entity,
        name: `${hour}:${minute.toString().padStart(2, "0")}`,
        icon: SCHEDULE_ICONS[displayStatus],
      }}
        .catchInteraction=${false}
        secondaryText="${this._isEditing ? secondaryText : statusText}"
        class="timeline ${SCHEDULE_LABEL[displayStatus]}"
      >
        <div>
          ${!this._isEditing
        ? html`<span>${secondaryText}</span>`
        : nothing
      }
          ${this._isEditing
        ? html`<ha-button-menu class="edit-menu">
            <ha-icon-button slot="trigger"> 
                <ha-icon icon="mdi:dots-vertical"></ha-icon>
            </ha-icon-button>
            <ha-list-item
              @click=${() => this.handleEditEntry(schedule)} 
              ?disabled=${!this._config.actions?.edit} 
              graphic="icon"
              class='edit-entry'
              hasMeta
            >
              ${this._hass.localize('ui.common.edit')}
              <ha-icon slot="graphic" icon="mdi:pencil"></ha-icon>
            </ha-list-item>
            <ha-list-item 
              @click=${() => this.handleRemoveEntry(schedule)} 
              ?disabled=${!this._config.actions?.remove} 
              graphic="icon" 
              class='remove-entry'
              hasMeta
            >
              ${this._hass.localize('ui.common.remove')}
              <ha-icon slot="graphic" icon="mdi:delete"></ha-icon>
            </ha-list-item>
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

  handlePortionsChanged(ev: InputEvent, entry: EditScheduleEntry) {
    const portions = parseInt((ev.target as HTMLInputElement).value);
    this._editSchedule = { ...entry, portions };
  }

  renderSwitch() {
    if (this._config.switch && !this._switchEntity) {
      return html`<ha-alert alert-type="warning">
        ${createEntityNotFoundWarning(this._hass, this._config.switch)}
      </ha-alert>`;
    }

    const isAddDisabled = this._schedules.length >= MAX_ENTRIES;

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
    const schedules: Array<ScheduleEntry> = [];
    let res;
    while ((res = pattern.exec(this._scheduleEntity?.state)) !== null) {
      schedules.push({
        id: parseInt(res.groups!.id),
        hour: parseInt(res.groups!.hour),
        minute: parseInt(res.groups!.minute),
        portions: parseInt(res.groups!.portions),
        status: parseInt(res.groups!.status),
      });
    }
    return schedules.filter(({ hour }) => hour !== 255)
      .sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }

  isSaveDisabled(entry: EditScheduleEntry) {
    if (entry.id === null) {
      return entry.hour < 0 || entry.hour > 23
        || entry.minute < 0 || entry.minute > 59
        || entry.portions < 1 || entry.portions > MAX_PORTIONS;
    } else {
      const schedule = this._schedules.find(e => e.id === entry.id);
      return schedule?.hour === entry.hour
        && schedule?.minute === entry.minute
        && schedule?.portions === entry.portions;
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
              .value=${entry.portions} 
              type="number" 
              no-spinner 
              label=${this._config.unit_of_measurement ?? localize('ui.portions')}
              max=${MAX_PORTIONS}
              min="1"
              @change=${(ev: InputEvent) => this.handlePortionsChanged(ev, entry)}
            ></ha-textfield>
          </div>
          <div class='edit-row-spacer' style="flex-basis: ${spacerHeight}px"></div>
        `
    }

    if (this._schedules.length === 0) {
      return html`<hui-generic-entity-row
      class="empty-row"
      .hass=${this._hass}
      .config=${{
          entity: this._config.entity,
          name: localize('ui.empty'),
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

  setConfig(config: DispenserScheduleCardConfig) {
    const editable = config.editable ?? "toggle";

    if (editable === "always") {
      this._isEditing = true;
    } else if (editable === "never") {
      this._isEditing = false;
    } else if (editable !== "toggle") {
      throw new Error(`Invalid editable option: ${editable}`);
    }

    this._config = {
      ...config,
      editable,
    };
  }
}