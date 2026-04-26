import { html, LitElement, nothing, unsafeCSS } from "lit";
import { ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { STATE_NOT_RUNNING } from "home-assistant-js-websocket";

import { customElement } from "lit/decorators/custom-element.js";

import {
  Device,
  EntryFieldDescriptor,
  EntryFieldRole,
  EntryStatus,
  ScheduleEntry,
  EditScheduleEntry,
} from "./types/common";
import type { TemplateResult } from "lit";
import {
  Weekday,
  formatWeekday,
  formatWeekdays,
  getFirstWeekdayOfLocale,
  weekdaysInLocaleOrder,
} from "./types/weekday";
import {
  canonicalizeWeekdays,
  getEditableWeekdays,
  hasSelectedWeekdays,
  isEveryDayWeekdays,
  isNeverRepeatWeekdays,
  toggleEditableWeekday,
  weekdaysEqual,
  type WeekdayPolicy,
} from "./types/scheduleWeekdays";

import {
  DefaultDisplayConfig,
  DispenserScheduleCardConfig,
} from "./types/config";

import { type HomeAssistant, EMPTY_HOME_ASSISTANT } from "./types/ha";
import localize from "./localization";
import { createDevice } from "./devices";
import { renderEntityRow } from "./rows/entityRow";

import DispenserScheduleCardStyles from "./dispenser-schedule-card.css";

const createEntityNotFoundWarning = (hass: HomeAssistant, entityId?: string) =>
  hass.config.state !== STATE_NOT_RUNNING
    ? hass.localize("ui.panel.lovelace.warning.entity_not_found", {
        entity: entityId || "[empty]",
      })
    : hass.localize("ui.panel.lovelace.warning.starting");

/** `ha-input` and similar expose the same validation API as native inputs. */
type ConstraintValidatableElement = Element & {
  checkValidity: () => boolean;
  reportValidity: () => boolean;
};

function asConstraintValidatable(
  el: Element | undefined
): ConstraintValidatableElement | null {
  if (
    el &&
    "checkValidity" in el &&
    typeof (el as ConstraintValidatableElement).checkValidity === "function" &&
    "reportValidity" in el &&
    typeof (el as ConstraintValidatableElement).reportValidity === "function"
  ) {
    return el as ConstraintValidatableElement;
  }
  return null;
}

@customElement("dispenser-schedule-card")
class DispenserScheduleCard extends LitElement {
  declare _config: DispenserScheduleCardConfig;
  declare _hass: HomeAssistant;
  declare _isEditing: boolean;
  declare _isReady: boolean;
  declare _schedules: Array<ScheduleEntry>;
  declare _editSchedule: EditScheduleEntry | null;
  declare _isSaving: boolean;
  declare _device: Device;

  private _entryLabelInputEl: ConstraintValidatableElement | null = null;

  private _onEntryLabelInputRef = (el: Element | undefined) => {
    const input = asConstraintValidatable(el);
    if (input !== this._entryLabelInputEl) {
      this._entryLabelInputEl = input;
      this.requestUpdate();
    }
  };

  private _weekdayPolicy(): WeekdayPolicy | undefined {
    const w = this._device.capabilities.weeklySchedule;
    return typeof w === "object" ? w : undefined;
  }

  constructor() {
    super();
    this._isReady = false;
    this._schedules = [];
    this._editSchedule = null;
    this._isSaving = false;
  }

  static get properties() {
    return {
      _config: { state: true },
      _isEditing: { state: true },
      _isReady: { state: true },
      _schedules: { state: true },
      _editSchedule: { state: true },
      _isSaving: { state: true },
    };
  }

  static get styles() {
    return unsafeCSS(DispenserScheduleCardStyles);
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._device) return;
    this._device.updateHass(hass);
    this._schedules = this._device.getSchedule();
  }

  handleEditToggle() {
    this._isEditing = !this._isEditing;
  }

  handleEditEntry(entry: ScheduleEntry) {
    this._editSchedule = {
      key: entry.key,
      hour: entry.hour,
      minute: entry.minute,
      values: [...entry.values],
      label: entry.label ?? "",
      weekdays: entry.weekdays ? [...entry.weekdays] : undefined,
    };
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
    if (entry.readonly) return;
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
      case "skip_today":
        void this._device.setEntrySkipForToday(entry, true);
        break;
      case "unskip_today":
        void this._device.setEntrySkipForToday(entry, false);
        break;
    }
  }

  handleCancel() {
    this._editSchedule = null;
  }

  async handleSaveEntry() {
    const entry = this._editSchedule;
    if (!entry) return;
    const caps = this._device.capabilities;
    if (caps.hasEntryLabel !== false) {
      const labelEl = this._entryLabelInputEl;
      if (!labelEl || !labelEl.reportValidity()) return;
    }
    const policy = this._weekdayPolicy();
    if (caps.weeklySchedule && !hasSelectedWeekdays(entry.weekdays, policy))
      return;

    const normalizedEntry: EditScheduleEntry = caps.weeklySchedule
      ? { ...entry, weekdays: canonicalizeWeekdays(entry.weekdays, policy) }
      : { ...entry, weekdays: undefined };

    this._isSaving = true;
    try {
      if (entry.key === null) {
        await this._device.addEntry(normalizedEntry);
      } else {
        await this._device.editEntry(normalizedEntry);
      }
      this._editSchedule = null;
    } finally {
      this._isSaving = false;
    }
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

  getDisplayedScheduleRows(): ScheduleEntry[] {
    const caps = this._device.capabilities;
    if (this._isEditing) {
      return this._schedules.filter((entry) => !entry.readonly);
    }
    if (!caps.weeklySchedule) {
      return this._schedules;
    }
    return this._device.filterScheduleForToday(this._schedules);
  }

  renderTimeString(entry: ScheduleEntry): string {
    return `${entry.hour}:${entry.minute.toString().padStart(2, "0")}`;
  }

  /** Accessible label for the row (time + value summary). */
  scheduleEntryNameTitle(entry: ScheduleEntry): string {
    const time = this.renderTimeString(entry);
    const summary = this.renderEntryValues(entry.values);
    return summary ? `${time} · ${summary}` : time;
  }

  getEntryFieldValue(
    entry: Pick<EditScheduleEntry | ScheduleEntry, "values">,
    fieldIndex: number
  ): number {
    const field = this._device.entryFields[fieldIndex];
    return entry.values[fieldIndex] ?? field?.config.min ?? 0;
  }

  resolveFieldLabel(field: EntryFieldDescriptor, fieldIndex: number): string {
    if (field.role === EntryFieldRole.POSITION) {
      return localize("entry_field.position") ?? localize("ui.amount") ?? "";
    }

    if (this._device.entryFields.length === 1) {
      const unitConfig = this._config.unit_of_measurement;
      if (typeof unitConfig === "object" && unitConfig !== null) {
        return unitConfig.other ?? localize("ui.amount") ?? "";
      }
      return unitConfig ?? localize("ui.amount") ?? "";
    }

    return (
      localize("entry_field.quantity_n", "{n}", String(fieldIndex + 1)) ??
      `${localize("ui.amount") ?? "Amount"} ${fieldIndex + 1}`
    );
  }

  /** Subtitle for edit-mode list rows when the device has a weekly schedule. */
  weekdaysSubtitle(entry: ScheduleEntry): string {
    if (!this._device.capabilities.weeklySchedule) return "";
    return this._formatWeekdaysSummary(entry.weekdays);
  }

  editWeekdaysSummary(entry: EditScheduleEntry): string {
    return this._formatWeekdaysSummary(entry.weekdays);
  }

  private _formatWeekdaysSummary(
    weekdays: readonly Weekday[] | undefined
  ): string {
    const policy = this._weekdayPolicy();
    if (policy?.allowNever && isNeverRepeatWeekdays(weekdays)) {
      return localize("ui.never_repeat") ?? "";
    }
    if (isEveryDayWeekdays(weekdays, policy)) {
      return localize("ui.every_day") ?? "";
    }
    return formatWeekdays(weekdays, this._hass.locale.language);
  }

  handleWeekdaySelect(ev: CustomEvent) {
    ev.preventDefault();
    const item = ev.detail?.item;
    const editSchedule = this._editSchedule;
    if (!item || !editSchedule) return;

    const wd = Number(item.value) as Weekday;
    const checked = item.action === "add";

    this._editSchedule = {
      ...editSchedule,
      weekdays: toggleEditableWeekday(editSchedule.weekdays, wd, checked),
    };
  }

  handleWeekdayDropdownShow(ev: Event) {
    const dropdown = ev.currentTarget as HTMLElement | null;
    if (!dropdown) return;
    dropdown.style.setProperty(
      "--weekday-dropdown-width",
      `${dropdown.getBoundingClientRect().width}px`
    );
  }

  renderWeekdaySelect(entry: EditScheduleEntry) {
    if (!this._device.capabilities.weeklySchedule) return nothing;
    const lang = this._hass.locale.language;
    const first = getFirstWeekdayOfLocale(this._hass.locale.first_weekday);
    const ordered = weekdaysInLocaleOrder(first);
    const selected = new Set(getEditableWeekdays(entry.weekdays));
    const repeatLabel = localize("ui.repeat") ?? "Repeat";
    const summary = this.editWeekdaysSummary(entry);

    return html`<ha-dropdown
      class="weekday-select"
      placement="bottom"
      @wa-show=${this.handleWeekdayDropdownShow}
      @wa-select=${this.handleWeekdaySelect}
    >
      <ha-picker-field
        slot="trigger"
        .value=${summary}
        .placeholder=${repeatLabel}
        aria-label=${repeatLabel}
        hide-clear-icon
      ></ha-picker-field>
      ${ordered.map((wd) => {
        const checked = selected.has(wd);
        return html`<ha-dropdown-item
          .value=${String(wd)}
          .action=${checked ? "remove" : "add"}
          type="checkbox"
          .checked=${checked}
        >
          ${formatWeekday(wd, lang, "long")}
        </ha-dropdown-item>`;
      })}
    </ha-dropdown>`;
  }

  renderQuantityValue(value: number): string {
    const { alternate_unit } = this._config;

    let pluralCategory: Intl.LDMLPluralRule = "other";
    try {
      const pluralRules = new Intl.PluralRules(this._hass.locale.language, {
        type: "cardinal",
      });
      pluralCategory = pluralRules.select(value);
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
    const mainStr = `${value} ${main_unit}`;

    let alternateStr;
    if (alternate_unit) {
      const {
        approximate,
        conversion_factor,
        unit_of_measurement: alt_unit,
      } = alternate_unit;
      const convertedAmount = value * conversion_factor;

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

  renderEntryValues(values: number[]): string {
    const fields = this._device.entryFields;
    if (fields.length === 0) return "";

    if (fields.length === 1) {
      const field = fields[0];
      const value = values[0] ?? field.config.min;
      return field.role === EntryFieldRole.POSITION
        ? `${this.resolveFieldLabel(field, 0)} ${value}`
        : this.renderQuantityValue(value);
    }

    return fields
      .map((field, fieldIndex) => {
        const value = values[fieldIndex] ?? field.config.min;
        const label = this.resolveFieldLabel(field, fieldIndex);
        return field.role === EntryFieldRole.POSITION
          ? `${label} ${value}`
          : `${label}: ${this.renderQuantityValue(value)}`;
      })
      .join(" ⸱ ");
  }

  renderCompactQuantityChips(
    values: number[],
    options: { showUnit?: boolean } = {}
  ): TemplateResult {
    const { showUnit = true } = options;
    const fields = this._device.entryFields;
    const unit = localize("ui.portions_other") ?? "portions";
    return html`
      <span class="entry-values-compact">
        ${fields.map((field, fieldIndex) => {
          const value = values[fieldIndex] ?? field.config.min;
          const compartmentColor = field.compartmentColor;
          return html`<span class="entry-value-chip">
            <ha-icon
              class="entry-value-chip-icon"
              style=${styleMap({
                color: compartmentColor
                  ? `var(--${compartmentColor}-color)`
                  : undefined,
              })}
              icon=${`mdi:numeric-${fieldIndex + 1}-box`}
            ></ha-icon>
            <span class="entry-value-chip-text">${value}</span>
          </span>`;
        })}
        ${showUnit
          ? html`<span class="entry-values-compact-unit">${unit}</span>`
          : nothing}
      </span>
    `;
  }

  renderCompactEntryValues(values: number[]) {
    const fields = this._device.entryFields;
    const allQuantity =
      fields.length > 1 &&
      fields.every((field) => field.role === EntryFieldRole.QUANTITY);

    if (!allQuantity) {
      return html`<span>${this.renderEntryValues(values)}</span>`;
    }

    return this.renderCompactQuantityChips(values, { showUnit: true });
  }

  renderEditRowNameContent(entry: ScheduleEntry): TemplateResult {
    const timeStr = this.renderTimeString(entry);
    const fields = this._device.entryFields;
    const values = entry.values;
    const allMultiQuantity =
      fields.length > 1 &&
      fields.every((f) => f.role === EntryFieldRole.QUANTITY);

    if (allMultiQuantity) {
      return html`<span class="entry-edit-primary">
        <span class="entry-edit-primary-time">${timeStr}</span>
        ${this.renderCompactQuantityChips(values, { showUnit: false })}
      </span>`;
    }

    const summary = this.renderEntryValues(values);
    return html`<span class="entry-edit-primary"
      >${timeStr} · ${summary}</span
    >`;
  }

  getPrimaryEntityId(): string | undefined {
    return this._device.getWatchedEntities()[0];
  }

  getRowStyle(color?: string) {
    return {
      "--state-icon-color": color,
      "--paper-item-icon-color": color,
    };
  }

  renderScheduleRow(entry: ScheduleEntry) {
    const displayStatus = this._device.getDisplayStatus(entry);
    const native = this._device.getNativeStatusDisplay(entry);

    const keyCfg = native ? this._config.display?.[native.key] : undefined;
    const statusCfg = this._config.display?.[displayStatus];
    const fallback = DefaultDisplayConfig[displayStatus];

    const icon =
      keyCfg?.icon ??
      statusCfg?.icon ??
      native?.icon ??
      fallback?.icon ??
      "mdi:clock-outline";
    const color =
      keyCfg?.color ||
      statusCfg?.color ||
      native?.color ||
      fallback?.color ||
      undefined;
    const overrideLabel = keyCfg?.label ?? statusCfg?.label;

    const timeOnly = this.renderTimeString(entry);
    const nameTitle = this.scheduleEntryNameTitle(entry);
    const style = this.getRowStyle(color);
    const caps = this._device.capabilities;
    const showSkipToday =
      caps.hasTodaySkip && this._device.canSkipEntryForToday(entry);
    const showUnskipToday =
      caps.hasTodaySkip && this._device.canUnskipEntryForToday(entry);
    const hasOverflowActions =
      !entry.readonly &&
      (caps.canEditEntries ||
        caps.canRemoveEntries ||
        caps.hasEntryToggle ||
        showSkipToday ||
        showUnskipToday);
    const rowClass = [
      "timeline",
      displayStatus,
      this._isEditing ? "dispenser-entity-row--edit-list" : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (!this._isEditing) {
      const rowSecondary =
        overrideLabel ??
        native?.label ??
        (displayStatus !== EntryStatus.NONE
          ? (localize(`status.${displayStatus}`) ?? displayStatus)
          : undefined);

      return renderEntityRow({
        className: rowClass,
        icon,
        iconColor: color,
        nameContent: timeOnly,
        nameTitle,
        secondaryContent: rowSecondary,
        style,
        nativeStatus: native?.key,
        valueContent: this.renderCompactEntryValues(entry.values),
      });
    }

    const rowSecondary = caps.weeklySchedule
      ? this.weekdaysSubtitle(entry)
      : undefined;

    return renderEntityRow({
      className: rowClass,
      icon,
      iconColor: color,
      nameContent: this.renderEditRowNameContent(entry),
      nameTitle,
      secondaryContent: rowSecondary || undefined,
      style,
      nativeStatus: native?.key,
      valueContent: hasOverflowActions
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
                    style=${styleMap({
                      color:
                        displayStatus === EntryStatus.DISABLED
                          ? "var(--primary-color)"
                          : "var(--state-inactive-color)",
                    })}
                  ></ha-icon>
                </ha-dropdown-item>`
              : nothing}
            ${showSkipToday
              ? html`<ha-dropdown-item
                  value="skip_today"
                  class="skip-today-entry"
                >
                  ${localize("ui.skip_today")}
                  <ha-icon slot="icon" icon="mdi:calendar-remove"></ha-icon>
                </ha-dropdown-item>`
              : nothing}
            ${showUnskipToday
              ? html`<ha-dropdown-item
                  value="unskip_today"
                  class="unskip-today-entry"
                >
                  ${localize("ui.unskip_today")}
                  <ha-icon
                    slot="icon"
                    icon="mdi:calendar-refresh"
                    style=${styleMap({
                      color: "var(--primary-color)",
                    })}
                  ></ha-icon>
                </ha-dropdown-item>`
              : nothing}
          </ha-dropdown>`
        : undefined,
    });
  }

  handleTimeChanged(ev: CustomEvent, entry: EditScheduleEntry) {
    const [hour, minute] = ev.detail.value.split(":").map(Number);
    this._editSchedule = { ...entry, hour, minute };
  }

  handleValueChanged(
    entry: EditScheduleEntry,
    fieldIndex: number,
    value: number
  ) {
    const values = [...entry.values];
    values[fieldIndex] = value;
    this._editSchedule = { ...entry, values };
  }

  handleAmountChanged(
    ev: InputEvent,
    entry: EditScheduleEntry,
    fieldIndex: number
  ) {
    const amountInput = ev.currentTarget as unknown as { value?: string };
    const value = parseInt(amountInput.value ?? "", 10);
    this.handleValueChanged(entry, fieldIndex, value);
  }

  handleEntryLabelInput(ev: Event) {
    const edit = this._editSchedule;
    if (!edit) return;
    const host = ev.currentTarget as Element & { value?: string };
    const value = host.value ?? "";
    this._editSchedule = { ...edit, label: value };
  }

  handlePositionChanged(
    ev: CustomEvent,
    entry: EditScheduleEntry,
    fieldIndex: number
  ) {
    const value = parseInt(ev.detail?.item?.value ?? "", 10);
    if (Number.isNaN(value)) return;
    this.handleValueChanged(entry, fieldIndex, value);
  }

  renderSwitch() {
    const primaryEntityId = this.getPrimaryEntityId();
    const displayInfo = this._device.getDisplayInfo();
    const globalToggle = this._device.getGlobalToggle();
    const rowTitle = localize("ui.name") ?? displayInfo.name ?? "";
    const iconColor = globalToggle?.state
      ? "var(--state-switch-on-color, var(--state-switch-active-color, var(--state-active-color)))"
      : undefined;

    if (!primaryEntityId || !this._hass.states[primaryEntityId]) {
      return html`<ha-alert alert-type="warning">
        ${createEntityNotFoundWarning(this._hass, primaryEntityId)}
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

    return renderEntityRow({
      className: "header-row timeline",
      icon: displayInfo.icon ?? "mdi:calendar-badge",
      iconColor,
      nameContent: rowTitle,
      nameTitle: rowTitle,
      style: this.getRowStyle(iconColor),
      valueContent: html`
        <div class="dispenser-entity-row__header-controls">
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
        </div>
      `,
    });
  }

  isSaveDisabled(entry: EditScheduleEntry) {
    const fields = this._device.entryFields;
    const caps = this._device.capabilities;
    const valuesInvalid = fields.some((field, fieldIndex) => {
      const value = entry.values[fieldIndex];
      return (
        value === undefined ||
        Number.isNaN(value) ||
        value < field.config.min ||
        value > field.config.max
      );
    });
    if (valuesInvalid) return true;

    if (caps.hasEntryLabel !== false) {
      const labelEl = this._entryLabelInputEl;
      if (!labelEl) return true;
      if (!labelEl.checkValidity()) return true;
    }

    const policy = this._weekdayPolicy();

    if (entry.key === null) {
      const weekdaysInvalid =
        !!caps.weeklySchedule && !hasSelectedWeekdays(entry.weekdays, policy);
      return (
        entry.hour < 0 ||
        entry.hour > 23 ||
        entry.minute < 0 ||
        entry.minute > 59 ||
        weekdaysInvalid
      );
    }

    const schedule = this._schedules.find((e) => e.key === entry.key);
    if (!schedule) return true;
    const sameTime =
      schedule.hour === entry.hour &&
      schedule.minute === entry.minute &&
      schedule.values.length === entry.values.length &&
      schedule.values.every(
        (value, fieldIndex) => value === entry.values[fieldIndex]
      );
    const sameWeekdays =
      !caps.weeklySchedule ||
      weekdaysEqual(entry.weekdays, schedule.weekdays, policy);
    const sameLabel = (schedule.label ?? "") === (entry.label ?? "");
    return sameTime && sameWeekdays && sameLabel;
  }

  renderConfigErrors() {
    const errors = this._device.getConfigErrors();
    if (errors.length === 0) return nothing;
    return html`${errors.map((err) => {
      const message =
        localize("errors.unresolved_field", "{field}", err.field) ??
        `Could not auto-resolve ${err.field}. Specify it manually.`;
      return html`<ha-alert alert-type="error">${message}</ha-alert>`;
    })}`;
  }

  renderContent() {
    const primaryEntityId = this.getPrimaryEntityId();

    if (!this._device.isAvailable()) {
      const scheduleEntity = primaryEntityId
        ? this._hass.states[primaryEntityId]
        : undefined;
      if (!scheduleEntity) {
        return html`<ha-alert alert-type="warning">
          ${createEntityNotFoundWarning(this._hass, primaryEntityId)}
        </ha-alert>`;
      }
    }

    if (this._editSchedule) {
      const entry = this._editSchedule;
      const fields = this._device.entryFields;
      const caps = this._device.capabilities;
      const timeFieldLabel = localize("ui.time") ?? "Time";
      const repeatFieldLabel = localize("ui.repeat") ?? "Repeat";
      const entryLabelFieldLabel = localize("entry_field.label") ?? "Label";
      const labelConstraints =
        caps.hasEntryLabel !== false ? caps.hasEntryLabel : null;

      return html`
        <ha-control-button-group>
          <ha-button
            @click=${this.handleCancel}
            class="cancel-button"
            ?disabled=${this._isSaving}
          >
            ${localize("ui.cancel")}
          </ha-button>
          <ha-button
            @click=${this.handleSaveEntry}
            class="save-button"
            ?disabled=${this._isSaving || this.isSaveDisabled(entry)}
          >
            ${this._isSaving
              ? html`<ha-spinner size="tiny"></ha-spinner>`
              : localize("ui.save")}
          </ha-button>
        </ha-control-button-group>
        <div class="edit-field">
          <label class="edit-field-label">${timeFieldLabel}</label>
          <ha-time-input
            aria-label=${timeFieldLabel}
            .value=${`${entry.hour}:${entry.minute.toString().padStart(2, "0")}`}
            .locale=${this._hass.locale}
            @value-changed=${(ev: CustomEvent) =>
              this.handleTimeChanged(ev, entry)}
          ></ha-time-input>
        </div>
        ${labelConstraints
          ? html`<div class="edit-field">
              <label class="edit-field-label">${entryLabelFieldLabel}</label>
              <ha-input
                .value=${entry.label ?? ""}
                @input=${this.handleEntryLabelInput}
                ${ref(this._onEntryLabelInputRef)}
              ></ha-input>
            </div>`
          : nothing}
        ${fields.map((field, fieldIndex) => {
          const label = this.resolveFieldLabel(field, fieldIndex);
          const value = this.getEntryFieldValue(entry, fieldIndex);

          if (field.role === EntryFieldRole.POSITION) {
            const options = Array.from(
              {
                length: field.config.max - field.config.min + 1,
              },
              (_v, optionIndex) => field.config.min + optionIndex
            );
            return html`<div class="edit-field">
              <label class="edit-field-label">${label}</label>
              <ha-dropdown
                placement="bottom"
                @wa-select=${(ev: CustomEvent) =>
                  this.handlePositionChanged(ev, entry, fieldIndex)}
              >
                <ha-picker-field
                  slot="trigger"
                  .value=${String(value)}
                  .placeholder=${label}
                  aria-label=${label}
                  hide-clear-icon
                ></ha-picker-field>
                ${options.map(
                  (option) =>
                    html`<ha-dropdown-item .value=${String(option)}>
                      ${option}
                    </ha-dropdown-item>`
                )}
              </ha-dropdown>
            </div>`;
          }

          return html`<div class="edit-field">
            <label class="edit-field-label">${label}</label>
            <ha-input
              aria-label=${label}
              .value=${String(value)}
              type="number"
              without-spin-buttons
              max=${String(field.config.max)}
              min=${String(field.config.min)}
              step=${String(field.config.step)}
              @change=${(ev: InputEvent) =>
                this.handleAmountChanged(ev, entry, fieldIndex)}
            ></ha-input>
          </div>`;
        })}
        ${this._device.capabilities.weeklySchedule
          ? html`<div class="edit-field">
              <label class="edit-field-label">${repeatFieldLabel}</label>
              ${this.renderWeekdaySelect(entry)}
            </div>`
          : nothing}
      `;
    }

    const listRows = this.getDisplayedScheduleRows();
    if (listRows.length === 0) {
      const available = this._device.isAvailable();
      const caps = this._device.capabilities;
      const todayFilteredOut =
        !!caps.weeklySchedule && !this._isEditing && this._schedules.length > 0;
      let label: string;
      if (!available) {
        label = this._hass.localize("state.default.unavailable");
      } else if (todayFilteredOut) {
        label = localize("ui.empty_today") ?? localize("ui.empty") ?? "";
      } else {
        label = localize("ui.empty") ?? "";
      }

      return renderEntityRow({
        className: "empty-row",
        icon: "mdi:calendar-blank-outline",
        nameContent: label,
        nameTitle: label,
      });
    }
    return listRows.map(this.renderScheduleRow, this);
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
          ${this.renderConfigErrors()}
          ${this._editSchedule ? nothing : this.renderSwitch()}
          ${this.renderContent()}
        </div>
      </ha-card>
    `;
  }

  getCardSize(): number {
    const rows = this._editSchedule
      ? this._schedules.length
      : this.getDisplayedScheduleRows().length;
    return 1 + rows;
  }

  setConfig(config: DispenserScheduleCardConfig) {
    if (!config.device?.type) {
      throw new Error("Missing required 'device.type' in card configuration");
    }

    let editable = config.editable ?? "toggle";
    if (
      editable !== "always" &&
      editable !== "never" &&
      editable !== "toggle"
    ) {
      throw new Error(`Invalid editable option: ${editable}`);
    }

    // Build the device now so capabilities are available immediately.
    // Capabilities are a pure function of config; any hass-dependent
    // resolution (e.g. PetLibro schedule-entity discovery) re-runs on the
    // next `set hass` via updateHass().
    this._device = createDevice(
      config.device,
      this._hass ?? EMPTY_HOME_ASSISTANT
    );

    const caps = this._device.capabilities;
    const hasAnyEditAction =
      caps.canAddEntries ||
      caps.canEditEntries ||
      caps.canRemoveEntries ||
      caps.hasEntryToggle ||
      caps.hasTodaySkip;

    if (!hasAnyEditAction) {
      editable = "never";
    }

    this._isEditing = editable === "always";
    this._config = { ...config, editable };

    if (this._hass) {
      this._device.updateHass(this._hass);
      this._schedules = this._device.getSchedule();
    }
  }
}
