import { html, LitElement, nothing, unsafeCSS } from "lit";
import { customElement } from "lit/decorators/custom-element.js";
import styles from "./petkit-schedule-matrix-card.css";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_MAP: Record<number, { icon: string; cls: string }> = {
  0: { icon: "mdi:clock-outline", cls: "pending" },
  1: { icon: "mdi:check", cls: "dispensed" },
  2: { icon: "mdi:check", cls: "dispensed" },
  3: { icon: "mdi:check", cls: "dispensed" },
  6: { icon: "mdi:help-circle-outline", cls: "skipped" },
  7: { icon: "mdi:close", cls: "failed" },
  8: { icon: "mdi:clock-remove-outline", cls: "skipped" },
  9: { icon: "mdi:alert-circle-outline", cls: "failed" },
};

interface FeedItem {
  time: number;
  name: string | null;
  amount: number | null;
  amount1: number | null;
  amount2: number | null;
  id: number | null;
}

interface DaySchedule {
  repeats: string | number | null;
  suspended: number | null;
  count: number;
  items: FeedItem[];
}

interface EditState {
  dayIndex: number;
  itemIndex: number | null; // null = adding new
  hour: number;
  minute: number;
  amount1: number;
  amount2: number;
}

interface CardConfig {
  entity: string;
  type: string;
}

@customElement("petkit-schedule-matrix-card")
class PetkitScheduleMatrixCard extends LitElement {
  declare _hass: any;
  declare _config: CardConfig;
  declare _activeDay: number;
  declare _editState: EditState | null;
  declare _showApplyDialog: boolean;
  declare _applyDays: boolean[];
  /** Local working copy of the schedule. null = no changes. */
  declare _draft: DaySchedule[] | null;

  static get properties() {
    return {
      _hass: { state: true },
      _config: { state: true },
      _activeDay: { state: true },
      _editState: { state: true },
      _showApplyDialog: { state: true },
      _applyDays: { state: true },
      _draft: { state: true },
    };
  }

  static get styles() {
    return unsafeCSS(styles);
  }

  constructor() {
    super();
    this._activeDay = 0;
    this._editState = null;
    this._showApplyDialog = false;
    this._applyDays = [false, false, false, false, false, false, false];
    this._draft = null;
  }

  set hass(hass: any) {
    this._hass = hass;
  }

  setConfig(config: CardConfig) {
    if (!config.entity) {
      throw new Error("entity is required");
    }
    this._config = config;
  }

  getCardSize(): number {
    return 5;
  }

  private get _entity(): any | undefined {
    return this._hass?.states?.[this._config?.entity ?? ""];
  }

  /** Server schedule from entity attributes (read-only source of truth). */
  private get _serverSchedule(): DaySchedule[] {
    const fdl = this._entity?.attributes?.feed_daily_list;
    if (!fdl || !Array.isArray(fdl)) return [];
    return fdl;
  }

  /** Active schedule: draft if dirty, otherwise server. */
  private get _schedule(): DaySchedule[] {
    return this._draft ?? this._serverSchedule;
  }

  private get _hasDraft(): boolean {
    return this._draft !== null;
  }

  private get _deviceId(): number | null {
    return this._entity?.attributes?.device_id ?? null;
  }

  private get _currentDaySchedule(): DaySchedule | null {
    return this._schedule[this._activeDay] ?? null;
  }

  /** Ensure _draft has a deep clone to mutate. */
  private _ensureDraft(): DaySchedule[] {
    if (!this._draft) {
      this._draft = JSON.parse(JSON.stringify(this._serverSchedule));
    }
    return this._draft!;
  }

  // --- Status from state string ---
  private _getStatusMap(): Map<number, number> {
    const state = this._entity?.state ?? "";
    const map = new Map<number, number>();
    if (!state || state === "unknown" || state === "unavailable") return map;
    const parts = state.split(",");
    for (let i = 0; i + 4 < parts.length; i += 5) {
      const timeSec = parseInt(parts[i + 1]) * 3600 + parseInt(parts[i + 2]) * 60;
      const status = parseInt(parts[i + 4]);
      map.set(timeSec, status);
    }
    return map;
  }

  // --- Rendering ---
  render() {
    if (!this._hass || !this._config) return nothing;

    const entity = this._entity;
    if (!entity) {
      return html`<ha-card>
        <div class="card-content">
          <ha-alert alert-type="warning">Entity not found: ${this._config.entity}</ha-alert>
        </div>
      </ha-card>`;
    }

    return html`
      <ha-card>
        ${this._renderHeader()}
        ${this._renderTabs()}
        ${this._editState ? this._renderEditForm() : this._renderScheduleList()}
        ${this._renderToolbar()}
        ${this._showApplyDialog ? this._renderApplyDialog() : nothing}
      </ha-card>
    `;
  }

  private _renderHeader() {
    const day = this._currentDaySchedule;
    const isSuspended = day?.suspended === 1;
    return html`
      <div class="card-header">
        <span class="title">
          <ha-icon icon="mdi:calendar-clock"></ha-icon>
          Feeding Schedule
          ${isSuspended ? html`<span class="suspended-badge">Paused</span>` : nothing}
          ${this._hasDraft ? html`<span class="draft-badge">Unsaved</span>` : nothing}
        </span>
      </div>
    `;
  }

  private _renderTabs() {
    return html`
      <div class="tab-bar">
        ${DAY_LABELS.map(
          (label, i) => html`
            <button
              class=${this._activeDay === i ? "active" : ""}
              @click=${() => this._setActiveDay(i)}
            >
              ${label}
            </button>
          `
        )}
      </div>
    `;
  }

  private _renderScheduleList() {
    const day = this._currentDaySchedule;
    if (!day || !day.items || day.items.length === 0) {
      return html`<div class="empty-state">No feeds scheduled for this day</div>`;
    }

    const statusMap = this._getStatusMap();

    return html`
      <div class="schedule-list">
        ${day.items
          .map((item, idx) => ({ item, idx }))
          .sort((a, b) => (a.item.time ?? 0) - (b.item.time ?? 0))
          .map(({ item, idx }) => this._renderScheduleRow(item, idx, statusMap))}
      </div>
    `;
  }

  private _renderScheduleRow(
    item: FeedItem,
    idx: number,
    statusMap: Map<number, number>,
  ) {
    const t = item.time ?? 0;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const a1 = item.amount1 ?? 0;
    const a2 = item.amount2 ?? 0;
    const statusCode = statusMap.get(t) ?? 0;
    const status = STATUS_MAP[statusCode] ?? STATUS_MAP[0];

    return html`
      <div class="schedule-row">
        <span class="time">${h}:${m.toString().padStart(2, "0")}</span>
        <div class="amounts">
          <span class="hopper h1">H1: ${a1}</span>
          <span class="hopper h2">H2: ${a2}</span>
        </div>
        <span class="status-icon ${status.cls}">
          <ha-icon icon="${status.icon}"></ha-icon>
        </span>
        <div class="actions">
          <ha-icon-button @click=${() => this._startEdit(idx)}>
            <ha-icon icon="mdi:pencil"></ha-icon>
          </ha-icon-button>
          <ha-icon-button @click=${() => this._removeEntry(idx)}>
            <ha-icon icon="mdi:delete"></ha-icon>
          </ha-icon-button>
        </div>
      </div>
    `;
  }

  private _renderEditForm() {
    const e = this._editState!;
    return html`
      <div class="edit-form">
        <div class="edit-row">
          <ha-textfield
            .value=${e.hour}
            type="number"
            no-spinner
            label="Hour"
            min="0"
            max="23"
            @change=${(ev: InputEvent) => {
              this._editState = { ...e, hour: parseInt((ev.target as HTMLInputElement).value) || 0 };
            }}
          ></ha-textfield>
          <ha-textfield
            .value=${e.minute}
            type="number"
            no-spinner
            label="Min"
            min="0"
            max="59"
            @change=${(ev: InputEvent) => {
              this._editState = { ...e, minute: parseInt((ev.target as HTMLInputElement).value) || 0 };
            }}
          ></ha-textfield>
          <ha-textfield
            .value=${e.amount1}
            type="number"
            no-spinner
            label="Hopper 1"
            min="0"
            max="50"
            @change=${(ev: InputEvent) => {
              this._editState = { ...e, amount1: parseInt((ev.target as HTMLInputElement).value) };
            }}
          ></ha-textfield>
          <ha-textfield
            .value=${e.amount2}
            type="number"
            no-spinner
            label="Hopper 2"
            min="0"
            max="50"
            @change=${(ev: InputEvent) => {
              this._editState = { ...e, amount2: parseInt((ev.target as HTMLInputElement).value) };
            }}
          ></ha-textfield>
        </div>
        <div class="edit-actions">
          <mwc-button @click=${() => (this._editState = null)}>Cancel</mwc-button>
          <mwc-button raised @click=${() => this._saveEdit()}>OK</mwc-button>
        </div>
      </div>
    `;
  }

  private _renderToolbar() {
    if (this._editState) return nothing;
    return html`
      <div class="toolbar">
        <div class="toolbar-left">
          <mwc-button @click=${() => this._startAdd()}>
            <ha-icon icon="mdi:clock-plus"></ha-icon>
            Add
          </mwc-button>
          <mwc-button @click=${() => this._openApplyDialog()}>
            <ha-icon icon="mdi:content-copy"></ha-icon>
            Copy to days
          </mwc-button>
        </div>
        ${this._hasDraft
          ? html`<div class="toolbar-right">
              <mwc-button @click=${() => this._discardDraft()}>
                Discard
              </mwc-button>
              <mwc-button raised @click=${() => this._applyDraft()}>
                <ha-icon icon="mdi:cloud-upload"></ha-icon>
                Apply
              </mwc-button>
            </div>`
          : nothing}
      </div>
    `;
  }

  private _renderApplyDialog() {
    return html`
      <div class="apply-overlay" @click=${(e: Event) => {
        if ((e.target as HTMLElement).classList.contains("apply-overlay")) {
          this._showApplyDialog = false;
        }
      }}>
        <div class="apply-dialog">
          <h3>Copy ${DAY_LABELS[this._activeDay]}'s schedule to:</h3>
          <div class="day-checkboxes">
            ${DAY_LABELS.map(
              (label, i) => html`
                <label class=${i === this._activeDay ? "current" : ""}>
                  <input
                    type="checkbox"
                    ?checked=${this._applyDays[i]}
                    ?disabled=${i === this._activeDay}
                    @change=${(ev: Event) => {
                      const checked = (ev.target as HTMLInputElement).checked;
                      const newDays = [...this._applyDays];
                      newDays[i] = checked;
                      this._applyDays = newDays;
                    }}
                  />
                  ${label} ${i === this._activeDay ? "(current)" : ""}
                </label>
              `
            )}
          </div>
          <div class="dialog-actions">
            <mwc-button @click=${() => (this._showApplyDialog = false)}>Cancel</mwc-button>
            <mwc-button raised @click=${() => this._copyToSelectedDays()}>Copy</mwc-button>
          </div>
        </div>
      </div>
    `;
  }

  // --- Actions (all mutate draft, never call API directly) ---
  private _setActiveDay(day: number) {
    this._activeDay = day;
    this._editState = null;
  }

  private _startEdit(itemIndex: number) {
    const day = this._currentDaySchedule;
    if (!day) return;
    const item = day.items[itemIndex];
    if (!item) return;
    const t = item.time ?? 0;
    this._editState = {
      dayIndex: this._activeDay,
      itemIndex,
      hour: Math.floor(t / 3600),
      minute: Math.floor((t % 3600) / 60),
      amount1: item.amount1 ?? 0,
      amount2: item.amount2 ?? 0,
    };
  }

  private _startAdd() {
    this._editState = {
      dayIndex: this._activeDay,
      itemIndex: null,
      hour: 0,
      minute: 0,
      amount1: 1,
      amount2: 1,
    };
  }

  /** Save edit to draft (no API call). */
  private _saveEdit() {
    const e = this._editState;
    if (!e) return;
    const draft = this._ensureDraft();

    const timeInSeconds = e.hour * 3600 + e.minute * 60;
    const newItem: FeedItem = {
      time: timeInSeconds,
      name: `Feed ${e.hour}:${e.minute.toString().padStart(2, "0")}`,
      amount: null,
      amount1: e.amount1,
      amount2: e.amount2,
      id: timeInSeconds,
    };

    const day = draft[e.dayIndex];
    if (!day) return;

    if (e.itemIndex === null) {
      day.items.push(newItem);
    } else {
      day.items[e.itemIndex] = newItem;
    }
    day.count = day.items.length;

    // Trigger re-render with new draft reference
    this._draft = [...draft];
    this._editState = null;
  }

  /** Remove entry from draft (no API call). */
  private _removeEntry(itemIndex: number) {
    const draft = this._ensureDraft();
    const day = draft[this._activeDay];
    if (!day) return;
    day.items.splice(itemIndex, 1);
    day.count = day.items.length;
    this._draft = [...draft];
  }

  private _openApplyDialog() {
    this._applyDays = DAY_LABELS.map((_, i) => i === this._activeDay);
    this._showApplyDialog = true;
  }

  /** Copy current day's schedule to selected days in draft (no API call). */
  private _copyToSelectedDays() {
    const draft = this._ensureDraft();
    const sourceDay = draft[this._activeDay];
    if (!sourceDay) return;

    for (let i = 0; i < this._applyDays.length; i++) {
      if (this._applyDays[i] && i !== this._activeDay && draft[i]) {
        draft[i].items = JSON.parse(JSON.stringify(sourceDay.items));
        draft[i].count = sourceDay.items.length;
      }
    }

    this._draft = [...draft];
    this._showApplyDialog = false;
  }

  /** Discard all local changes, revert to server schedule. */
  private _discardDraft() {
    this._draft = null;
    this._editState = null;
  }

  /** Send the draft to the API (the only point where API is called). */
  private _applyDraft() {
    if (!this._draft) return;
    this._callSetSchedule(this._draft);
    this._draft = null;
  }

  // --- API ---
  private _callSetSchedule(schedule: DaySchedule[]) {
    if (!this._deviceId) {
      console.error("[PetkitMatrix] No device_id in entity attributes");
      return;
    }

    const serviceData = {
      device_id: this._deviceId,
      feed_daily_list: schedule.map((day) => ({
        repeats: day.repeats,
        suspended: day.suspended ?? 0,
        items: (day.items || []).map((item) => ({
          time: item.time,
          name: item.name,
          amount: item.amount ?? 0,
          amount1: item.amount1 ?? 0,
          amount2: item.amount2 ?? 0,
        })),
      })),
    };

    this._hass.callService("petkit", "set_feeding_schedule", serviceData);
  }
}
