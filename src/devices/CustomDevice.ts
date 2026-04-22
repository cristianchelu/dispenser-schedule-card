import {
  AmountConfig,
  Device,
  DeviceCapabilities,
  DeviceDisplayInfo,
  EditScheduleEntry,
  EntryFieldDescriptor,
  EntryFieldRole,
  EntryStatus,
  GlobalToggleInfo,
  ScheduleEntry,
} from "../types/common";
import { HomeAssistant } from "../types/ha";

export interface ServiceCallActionConfig {
  add?: string;
  edit?: string;
  remove?: string;
  toggle?: string;
}

export interface CustomDeviceConfig {
  type: "custom";
  entity: string;
  status_pattern: string;
  status_map: Array<`${string} -> ${string}`>;
  max_entries: number;
  max_amount: number;
  min_amount: number;
  step_amount: number;
  switch?: string;
  actions?: ServiceCallActionConfig;
}

function getFirstGap(arr: Array<number>): number {
  arr.sort((a, b) => a - b);
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== i) {
      return i;
    }
  }
  return arr.length;
}

function getNextId(arr: Array<number>): number {
  return !arr.length ? 0 : Math.min(getFirstGap(arr), Math.max(...arr) + 1);
}

const KNOWN_ENTRY_STATUSES = new Set<string>(Object.values(EntryStatus));

export default class CustomDevice extends Device<CustomDeviceConfig> {
  readonly statusPattern: RegExp;
  readonly statusMap: Record<string, string>;
  private readonly _customStatusByEntryKey = new Map<string, string>();

  constructor(deviceConfig: CustomDeviceConfig, hass: HomeAssistant) {
    super(deviceConfig, hass);

    this.statusPattern = new RegExp(deviceConfig.status_pattern);
    this.statusMap = deviceConfig.status_map.reduce<Record<string, string>>(
      (acc, item) => {
        const [key, value] = item.split(" -> ");
        acc[key] = value;
        return acc;
      },
      {}
    );
  }

  get capabilities(): DeviceCapabilities {
    const actions = this.deviceConfig.actions;
    return {
      hasEntryToggle: !!actions?.toggle,
      hasGlobalToggle: !!this.deviceConfig.switch,
      canAddEntries: !!actions?.add,
      canRemoveEntries: !!actions?.remove,
      canEditEntries: !!actions?.edit,
      maxEntries: this.deviceConfig.max_entries,
      hasWeeklySchedule: false,
      hasTodaySkip: false,
      hasEntryLabel: false,
    };
  }

  get entryFields(): EntryFieldDescriptor[] {
    const config: AmountConfig = {
      min: this.deviceConfig.min_amount,
      max: this.deviceConfig.max_amount,
      step: this.deviceConfig.step_amount,
    };
    return [{ role: EntryFieldRole.QUANTITY, config }];
  }

  getWatchedEntities(): string[] {
    const entities = [this.deviceConfig.entity];
    if (this.deviceConfig.switch) {
      entities.push(this.deviceConfig.switch);
    }
    return entities;
  }

  getDisplayInfo(): DeviceDisplayInfo {
    const state =
      this.hass.states[this.deviceConfig.switch ?? this.deviceConfig.entity];
    return {
      name: state?.attributes.friendly_name,
      icon: state?.attributes.icon,
    };
  }

  isAvailable(): boolean {
    const entity = this.hass.states[this.deviceConfig.entity];
    return !!entity && entity.state !== "unavailable";
  }

  getSchedule(): ScheduleEntry[] {
    this._customStatusByEntryKey.clear();
    const state = this.hass.states[this.deviceConfig.entity]?.state;
    if (!state) return [];

    const schedules: ScheduleEntry[] = [];
    let res;
    let i = 0;
    const regex = new RegExp(this.statusPattern, "g");
    while (
      (res = regex.exec(state)) !== null &&
      i < this.deviceConfig.max_entries
    ) {
      const id = res.groups!.id;
      const mapped = this.statusMap[parseInt(res.groups!.status)];
      const isKnown = KNOWN_ENTRY_STATUSES.has(mapped);
      const status = isKnown ? (mapped as EntryStatus) : EntryStatus.NONE;
      if (!isKnown && mapped !== undefined) {
        this._customStatusByEntryKey.set(id, mapped);
      }
      schedules.push({
        key: id,
        hour: parseInt(res.groups!.hour),
        minute: parseInt(res.groups!.minute),
        values: [parseInt(res.groups!.amount)],
        status,
      });
      i++;
    }
    return schedules
      .filter(({ hour }) => hour !== 255)
      .sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }

  getEntryStatusInfo(entry: ScheduleEntry): {
    statusKey?: string;
    statusLabel?: string;
  } {
    const custom = this._customStatusByEntryKey.get(entry.key);
    if (!custom) return {};
    return { statusKey: custom, statusLabel: custom };
  }

  getGlobalToggle(): GlobalToggleInfo | null {
    if (!this.deviceConfig.switch) return null;
    const switchEntity = this.hass.states[this.deviceConfig.switch];
    if (!switchEntity) return null;
    return { state: switchEntity.state === "on" };
  }

  getDisplayStatus(entry: ScheduleEntry): EntryStatus {
    const { hour, minute, status } = entry;

    if (status === EntryStatus.PENDING) {
      const scheduledDate = new Date();
      scheduledDate.setHours(hour, minute);
      const isPastDue = new Date().getTime() > scheduledDate.getTime();
      if (isPastDue) {
        return EntryStatus.SKIPPED;
      }

      const globalToggle = this.getGlobalToggle();
      if (globalToggle?.state === false) {
        return EntryStatus.DISABLED;
      }
    }

    return status;
  }

  private callAction(
    actionKey: keyof ServiceCallActionConfig,
    data: Record<string, unknown>
  ): Promise<void> {
    const actionStr = this.deviceConfig.actions?.[actionKey];
    if (!actionStr) return Promise.resolve();
    const [domain, action] = actionStr.split(".");
    return this.hass.callService(domain, action, data);
  }

  private getAmountKey(actionKey: keyof ServiceCallActionConfig): string {
    const actionStr = this.deviceConfig.actions?.[actionKey];
    if (!actionStr) return "amount";
    const [domain, action] = actionStr.split(".");
    try {
      return (
        Object.keys(this.hass.services[domain][action].fields).find((k) =>
          ["amount", "portions"].includes(k)
        ) ?? "amount"
      );
    } catch {
      return "amount";
    }
  }

  async addEntry(entry: EditScheduleEntry): Promise<void> {
    const existingKeys = this.getSchedule().map((e) => parseInt(e.key));
    const id = getNextId(existingKeys);
    const amountKey = this.getAmountKey("add");
    await this.callAction("add", {
      id,
      hour: entry.hour,
      minute: entry.minute,
      [amountKey]: entry.values[0],
    });
  }

  async editEntry(entry: EditScheduleEntry): Promise<void> {
    if (entry.key === null) return;
    const amountKey = this.getAmountKey("edit");
    await this.callAction("edit", {
      id: parseInt(entry.key),
      hour: entry.hour,
      minute: entry.minute,
      [amountKey]: entry.values[0],
    });
  }

  async removeEntry(entry: ScheduleEntry): Promise<void> {
    await this.callAction("remove", { id: parseInt(entry.key) });
  }

  async toggleEntry(entry: ScheduleEntry): Promise<void> {
    await this.callAction("toggle", { id: parseInt(entry.key) });
  }

  async setGlobalToggle(enabled: boolean): Promise<void> {
    if (!this.deviceConfig.switch) return;
    const action = enabled ? "turn_on" : "turn_off";
    await this.hass.callService("homeassistant", action, {
      entity_id: this.deviceConfig.switch,
    });
  }

  getNewEntryDefaults(): EditScheduleEntry {
    return {
      key: null,
      hour: 0,
      minute: 0,
      values: [this.entryFields[0].config.min],
    };
  }
}
