import {
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

const MAX_ENTRIES = 10;
const ENTRY_REGEX =
  /^(?<hour>\d{2})(?<minute>\d{2})(?<amount>\d{2})(?<status>\d{2})$/;

export interface XiaomiSmartPetFeeder2DeviceConfig {
  type: "xiaomi-smart-feeder-2";
  entity: string;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function parseEntryToken(token: string): Omit<ScheduleEntry, "key"> | null {
  const m = token.match(ENTRY_REGEX);
  if (!m || !m.groups) return null;
  const hour = parseInt(m.groups.hour, 10);
  const minute = parseInt(m.groups.minute, 10);
  const value = parseInt(m.groups.amount, 10);
  const statusCode = m.groups.status;
  const status =
    statusCode === "01" ? EntryStatus.PENDING : EntryStatus.DISABLED;
  return { hour, minute, values: [value], status };
}

function encodeEntryToken(
  hour: number,
  minute: number,
  value: number,
  enabled: boolean
): string {
  return `${pad2(hour)}${pad2(minute)}${pad2(value)}${enabled ? "01" : "00"}`;
}

function parseRawValue(raw: string | undefined): {
  globalToggle: string;
  entryTokens: string[];
} {
  if (!raw || typeof raw !== "string") {
    return { globalToggle: "1", entryTokens: [] };
  }
  const trimmed = raw.trim();
  const inner = trimmed.replace(/^\[/, "").replace(/\]$/, "");
  const parts = inner.length ? inner.split(",") : [];
  if (parts.length === 0) {
    return { globalToggle: "1", entryTokens: [] };
  }
  const globalToggle = parts[0] === "0" ? "0" : "1";
  const entryTokens = parts.slice(1).filter((p) => p.length > 0);
  return { globalToggle, entryTokens };
}

function serialize(globalToggle: string, entryTokens: string[]): string {
  return `[${[globalToggle, ...entryTokens].join(",")}]`;
}

export default class XiaomiSmartPetFeeder2 extends Device<XiaomiSmartPetFeeder2DeviceConfig> {
  get capabilities(): DeviceCapabilities {
    return {
      hasEntryToggle: true,
      hasGlobalToggle: true,
      canAddEntries: true,
      canRemoveEntries: true,
      canEditEntries: true,
      maxEntries: MAX_ENTRIES,
      hasWeeklySchedule: false,
    };
  }

  get entryFields(): EntryFieldDescriptor[] {
    return [
      {
        role: EntryFieldRole.QUANTITY,
        config: { min: 1, max: 15, step: 1 },
      },
    ];
  }

  getWatchedEntities(): string[] {
    return [this.deviceConfig.entity];
  }

  getDisplayInfo(): DeviceDisplayInfo {
    const state = this.hass.states[this.deviceConfig.entity];
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
    const state = this.hass.states[this.deviceConfig.entity]?.state;
    const { entryTokens } = parseRawValue(state);
    const schedules: ScheduleEntry[] = [];
    for (let i = 0; i < entryTokens.length && i < MAX_ENTRIES; i++) {
      const parsed = parseEntryToken(entryTokens[i]);
      if (!parsed) continue;
      schedules.push({ key: String(i), ...parsed });
    }
    return schedules.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }

  getGlobalToggle(): GlobalToggleInfo | null {
    const state = this.hass.states[this.deviceConfig.entity]?.state;
    const { globalToggle } = parseRawValue(state);
    return { state: globalToggle === "1" };
  }

  getDisplayStatus(entry: ScheduleEntry): EntryStatus {
    const { status } = entry;

    if (status === EntryStatus.DISABLED) {
      return EntryStatus.DISABLED;
    }

    if (status === EntryStatus.PENDING) {
      const globalToggle = this.getGlobalToggle();
      if (globalToggle?.state === false) {
        return EntryStatus.DISABLED;
      }
      return EntryStatus.NONE;
    }

    return status;
  }

  private async writeState(globalToggle: string, entryTokens: string[]) {
    await this.hass.callService("text", "set_value", {
      entity_id: this.deviceConfig.entity,
      value: serialize(globalToggle, entryTokens),
    });
  }

  async addEntry(entry: EditScheduleEntry): Promise<void> {
    const state = this.hass.states[this.deviceConfig.entity]?.state;
    const { globalToggle, entryTokens } = parseRawValue(state);
    if (entryTokens.length >= MAX_ENTRIES) return;
    entryTokens.push(
      encodeEntryToken(entry.hour, entry.minute, entry.values[0], true)
    );
    await this.writeState(globalToggle, entryTokens);
  }

  async editEntry(entry: EditScheduleEntry): Promise<void> {
    if (entry.key === null) return;
    const idx = parseInt(entry.key, 10);
    if (Number.isNaN(idx) || idx < 0) return;

    const state = this.hass.states[this.deviceConfig.entity]?.state;
    const { globalToggle, entryTokens } = parseRawValue(state);
    if (idx >= entryTokens.length) return;

    const prev = parseEntryToken(entryTokens[idx]);
    const enabled = prev?.status === EntryStatus.PENDING;
    entryTokens[idx] = encodeEntryToken(
      entry.hour,
      entry.minute,
      entry.values[0],
      enabled
    );
    await this.writeState(globalToggle, entryTokens);
  }

  async removeEntry(entry: ScheduleEntry): Promise<void> {
    const idx = parseInt(entry.key, 10);
    if (Number.isNaN(idx) || idx < 0) return;

    const state = this.hass.states[this.deviceConfig.entity]?.state;
    const { globalToggle, entryTokens } = parseRawValue(state);
    if (idx >= entryTokens.length) return;
    entryTokens.splice(idx, 1);
    await this.writeState(globalToggle, entryTokens);
  }

  async toggleEntry(entry: ScheduleEntry): Promise<void> {
    const idx = parseInt(entry.key, 10);
    if (Number.isNaN(idx) || idx < 0) return;

    const state = this.hass.states[this.deviceConfig.entity]?.state;
    const { globalToggle, entryTokens } = parseRawValue(state);
    if (idx >= entryTokens.length) return;

    const parsed = parseEntryToken(entryTokens[idx]);
    if (!parsed) return;
    const enabled = parsed.status === EntryStatus.PENDING;
    entryTokens[idx] = encodeEntryToken(
      parsed.hour,
      parsed.minute,
      parsed.values[0],
      !enabled
    );
    await this.writeState(globalToggle, entryTokens);
  }

  async setGlobalToggle(enabled: boolean): Promise<void> {
    const state = this.hass.states[this.deviceConfig.entity]?.state;
    const { entryTokens } = parseRawValue(state);
    await this.writeState(enabled ? "1" : "0", entryTokens);
  }

  getNewEntryDefaults(): EditScheduleEntry {
    return {
      key: null,
      hour: 0,
      minute: 0,
      values: this.entryFields.map((field) => field.config.min),
    };
  }
}
