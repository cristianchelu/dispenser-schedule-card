import { html, LitElement, nothing, unsafeCSS } from "lit";
import { customElement } from 'lit/decorators.js';

import FeederCardStyles from "./feeder-card.css";
import localize from "./localization";
import { STATE_NOT_RUNNING } from "home-assistant-js-websocket";

interface FeederCardConfig {
  entity?: string;
  switch?: string;
  add_action: string;
  remove_action: string;
  edit_action: string;
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
  [SCHEDULE_STATUS.DISPENSED]: "status.dispensed",
  [SCHEDULE_STATUS.FAILED]: "status.failed",
  [SCHEDULE_STATUS.DISPENSING]: "status.dispensing",
  [SCHEDULE_STATUS.PENDING]: "status.pending",
  [SCHEDULE_STATUS.SKIPPED]: "status.skipped",
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

// export const formatTime = (
//   dateObj: Date,
//   locale: FrontendLocaleData,
//   config: HassConfig
// ) => formatTimeMem(locale, config.time_zone).format(dateObj);

// const formatTimeMem = memoizeOne(
//   (locale: FrontendLocaleData, serverTimeZone: string) =>
//     new Intl.DateTimeFormat(locale.language, {
//       hour: "numeric",
//       minute: "2-digit",
//       hourCycle: useAmPm(locale) ? "h12" : "h23",
//       timeZone: resolveTimeZone(locale.time_zone, serverTimeZone),
//     })
// );

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

@customElement('wired-toggle-card')
class FeederCard extends LitElement {
  declare _config: FeederCardConfig;
  declare _hass: any;
  declare _scheduleEntity: any;
  declare _switchEntity: any;
  declare _isEditing: boolean;
  declare _isReady: boolean;
  declare _schedules: Array<ScheduleEntry>;
  declare _editSchedules: Array<EditScheduleEntry>;

  constructor() {
    super();
    this._isReady = false;
    this._schedules = [];
    this._editSchedules = [];
  }

  static get properties() {
    return {
      _config: { state: true },
      _scheduleEntity: { state: true },
      _switchEntity: { state: true },
      _isEditing: { state: true },
      _isReady: { state: true },
      _schedules: { state: true },
      _editSchedules: { state: true },
    };
  }

  static get styles() {
    return unsafeCSS(FeederCardStyles);
  }

  set hass(hass: any) {
    this._hass = hass;
    this._scheduleEntity = hass.states[this._config.entity ?? ""];
    this._switchEntity = hass.states[this._config.switch ?? ""];
    if (this._scheduleEntity) {
      this._schedules = this.parseSchedule();
    }
  }

  handleEdit() {
    if (this._isEditing) {
      this._editSchedules = [];
      this._isEditing = false;
    } else {
      this._editSchedules = this._schedules;
      this._isEditing = true;
    }
  }

  handleAddEntry() {
    this._editSchedules.push({
      id: null,
      hour: 0,
      minute: 0,
      portions: 1,
    });
  }

  handleCancel() {
    this._isEditing = false;
    this._editSchedules = [];
  }

  handleSave(entry: EditScheduleEntry) {
    if (entry.id === null) {
      const id = getNextId(this._schedules.map(e => e.id));
      const [domain, action] = this._config.add_action.split('.');
      this._hass.callService(domain, action, {
        id,
        hour: entry.hour,
        minute: entry.minute,
        portions: entry.portions,
      });
      this._editSchedules = this._editSchedules.map(e => e === entry ? { ...e, id } : e);
    } else {
      const [domain, action] = this._config.edit_action.split('.');
      this._hass.callService(domain, action, {
        id: entry.id,
        hour: entry.hour,
        minute: entry.minute,
        portions: entry.portions,
      });
    }
  }

  handleDelete(entry: EditScheduleEntry) {
    if (entry.id) {
      const [domain, action] = this._config.remove_action.split('.');
      this._hass.callService(domain, action, {
        id: entry.id,
      });
    }
    this._editSchedules = this._editSchedules.filter(e => e !== entry);
  }

  async loadComponents() {
    // `ha-time-input` is not available until an entity that uses it is lazily loaded
    // so we need to wait for it to be available before we can enable editing.
    const helpers = await window.loadCardHelpers();

    helpers.createRowElement({ "type": "time-entity" });
    this._isReady = true;
  }

  renderScheduleRow(schedule: ScheduleEntry) {
    const { id, hour, minute, portions, status } = schedule;

    const scheduledDate = new Date();
    scheduledDate.setHours(hour, minute);

    // TODO: Handle case of FE timezone different from device timezone
    const isPastDue = new Date().getTime() > scheduledDate.getTime();
    const isSkipped = isPastDue && status == SCHEDULE_STATUS.PENDING;
    const displayStatus = isSkipped ? SCHEDULE_STATUS.SKIPPED : status;

    return html`<hui-generic-entity-row
        .hass=${this._hass}
        .config=${{
        entity: this._config.entity,
        name: `${hour}:${minute.toString().padStart(2, "0")}`,
        icon: SCHEDULE_ICONS[displayStatus],
      }}
        secondaryText="${localize(SCHEDULE_LABEL[displayStatus])}"
        class="timeline"
      >
        ${portions} ${localize('ui.portions')} ~${GRAMS_PER_PORTION * portions}g
      </hui-generic-entity-row>`;
  }

  handleTimeChanged(ev: CustomEvent, entry: EditScheduleEntry) {
    const [hour, minute] = ev.detail.value.split(':').map(Number);
    this._editSchedules = this._editSchedules.map(e => e === entry ? { ...e, hour, minute } : e);
    console.log(this._editSchedules);
  }

  handlePortionsChanged(ev: InputEvent, entry: EditScheduleEntry) {
    this._editSchedules = this._editSchedules.map(e => e === entry ? { ...e, portions: parseInt((ev.target as any).value) } : e);
    console.log(this._editSchedules);
  }

  renderSwitch() {
    if (!this._config.switch) {
      return nothing;
    }

    if (!this._switchEntity) {
      return html`<ha-alert alert-type="warning">
        ${createEntityNotFoundWarning(this._hass, this._config.switch)}
      </ha-alert>`;
    }

    return html`
      <hui-generic-entity-row
        .hass=${this._hass}
        .config=${{
        entity: this._config.switch,
        name: localize('ui.name') ?? this._switchEntity.attributes.friendly_name,
        icon: this._switchEntity.attributes.icon,
        state_color: true,
      }}
        class="${!this._isEditing ? "timeline" : ""}"
      >
        <mwc-button 
          @click=${this.handleEdit} 
          class='edit-button'
        >
          ${this._hass.localize(this._isEditing ? "ui.sidebar.done" : 'ui.common.edit')}
        </mwc-button>
        <ha-entity-toggle 
          .hass=${this._hass}
          .stateObj=${this._switchEntity}
        ></ha-entity-toggle>
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
      debugger;
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

    if (this._isEditing) {
      const isAddDisabled = this._editSchedules.length >= MAX_ENTRIES;
      return html`
        ${this._editSchedules.map((entry, _index) => html`
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
              label=${localize('ui.portions')}
              max=${MAX_PORTIONS}
              min="1"
              @change=${(ev: InputEvent) => this.handlePortionsChanged(ev, entry)}
            ></ha-textfield>
            <ha-icon-button 
              class='remove-entry' 
              @click=${() => this.handleDelete(entry)}
            >
              <ha-icon icon="mdi:delete"></ha-icon>
            </ha-icon-button>
            <ha-icon-button 
              class='save-entry' 
              @click=${() => this.handleSave(entry)}
              ?disabled=${this.isSaveDisabled(entry)}
            >
              <ha-icon icon="mdi:floppy"></ha-icon>
            </ha-icon-button>
          </div>
        `)}
        <ha-control-button-group>
          <ha-control-button @click=${this.handleAddEntry} ?disabled=${isAddDisabled}>
            <ha-icon icon="mdi:clock-plus"></ha-icon>
          </ha-control-button>
        </ha-control-button-group>`
    }

    return this._schedules
      .map(this.renderScheduleRow, this)
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
          ${this.renderSwitch()}
          ${this.renderContent()}
        </div>
      </ha-card>
    `;
  }

  getCardSize(): number {
    return 3;
  }

  setConfig(config: FeederCardConfig) {
    this._config = config;
  }
}