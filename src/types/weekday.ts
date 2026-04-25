import type { HassFirstWeekday } from "./ha";

/** ISO 8601 weekday: Monday = 1 … Sunday = 7 */
export enum Weekday {
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
  Sunday = 7,
}

export const ALL_WEEKDAYS: readonly Weekday[] = [
  Weekday.Monday,
  Weekday.Tuesday,
  Weekday.Wednesday,
  Weekday.Thursday,
  Weekday.Friday,
  Weekday.Saturday,
  Weekday.Sunday,
] as const;

/** JavaScript `Date.getDay()` / `getUTCDay()`: 0 = Sunday … 6 = Saturday */
export function jsWeekdayToWeekday(jsDay: number): Weekday {
  switch (jsDay) {
    case 0:
      return Weekday.Sunday;
    case 1:
      return Weekday.Monday;
    case 2:
      return Weekday.Tuesday;
    case 3:
      return Weekday.Wednesday;
    case 4:
      return Weekday.Thursday;
    case 5:
      return Weekday.Friday;
    case 6:
      return Weekday.Saturday;
    default:
      return Weekday.Monday;
  }
}

/** Gregorian weekday for a calendar date (month 1–12). */
export function weekdayFromYmd(
  year: number,
  month: number,
  day: number
): Weekday {
  const utc = Date.UTC(year, month - 1, day, 12, 0, 0);
  return jsWeekdayToWeekday(new Date(utc).getUTCDay());
}

/**
 * Today's calendar date in `timeZone` (IANA), then its ISO weekday.
 * Falls back to local date when `timeZone` is missing/invalid.
 */
export function getTodayWeekday(timeZone?: string): Weekday {
  const now = new Date();
  if (!timeZone) {
    return jsWeekdayToWeekday(now.getDay());
  }
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(now);
    const y = parseInt(parts.find((p) => p.type === "year")?.value ?? "", 10);
    const m = parseInt(parts.find((p) => p.type === "month")?.value ?? "", 10);
    const d = parseInt(parts.find((p) => p.type === "day")?.value ?? "", 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return jsWeekdayToWeekday(now.getDay());
    }
    return weekdayFromYmd(y, m, d);
  } catch {
    return jsWeekdayToWeekday(now.getDay());
  }
}

export function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  return [...days].sort((a, b) => a - b);
}

function mapHassFirstWeekday(
  firstWeekday: HassFirstWeekday
): Weekday | undefined {
  switch (firstWeekday) {
    case "monday":
      return Weekday.Monday;
    case "tuesday":
      return Weekday.Tuesday;
    case "wednesday":
      return Weekday.Wednesday;
    case "thursday":
      return Weekday.Thursday;
    case "friday":
      return Weekday.Friday;
    case "saturday":
      return Weekday.Saturday;
    case "sunday":
      return Weekday.Sunday;
    case "language":
      return undefined;
  }
}

/** First day of week for UI: ISO weekday 1–7. */
export function getFirstWeekdayOfLocale(
  firstWeekdayFromHass?: HassFirstWeekday
): Weekday {
  if (firstWeekdayFromHass !== undefined) {
    const fromHass = mapHassFirstWeekday(firstWeekdayFromHass);
    if (fromHass !== undefined) return fromHass;
  }

  return Weekday.Monday;
}

/** Order ALL_WEEKDAYS starting at `first` (inclusive), wrapping. */
export function weekdaysInLocaleOrder(first: Weekday): Weekday[] {
  const startIdx = ALL_WEEKDAYS.indexOf(first);
  if (startIdx < 0) return [...ALL_WEEKDAYS];
  return [...ALL_WEEKDAYS.slice(startIdx), ...ALL_WEEKDAYS.slice(0, startIdx)];
}

/** Reference UTC noon dates starting Monday 2024-01-01 (ISO weekday labels). */
export function weekdayToUtcDate(wd: Weekday): Date {
  const baseMonday = Date.UTC(2024, 0, 1, 12, 0, 0);
  const offsetDays = wd === Weekday.Sunday ? 6 : wd - 1;
  return new Date(baseMonday + offsetDays * 86400000);
}

export type WeekdayNameStyle = "narrow" | "short" | "long";

export function formatWeekday(
  wd: Weekday,
  language: string,
  weekdayStyle: WeekdayNameStyle = "short"
): string {
  try {
    return new Intl.DateTimeFormat(language, { weekday: weekdayStyle }).format(
      weekdayToUtcDate(wd)
    );
  } catch {
    return String(wd);
  }
}

const WEEKDAY_RANGE_DASH = "\u2013";

/**
 * ISO-order weekday formatting: consecutive runs of 3+ days become
 * "Mon–Wed"; shorter runs stay as separate weekday names. Joins groups with
 * locale-aware list formatting and supports multiple weekday label widths.
 */
export function formatWeekdays(
  weekdays: readonly Weekday[] | undefined,
  language: string,
  weekdayStyle: WeekdayNameStyle = "short"
): string {
  if (!weekdays?.length) return "";
  const sorted = sortWeekdays(weekdays);
  try {
    const fmt = new Intl.DateTimeFormat(language, { weekday: weekdayStyle });
    const label = (wd: Weekday) => fmt.format(weekdayToUtcDate(wd));
    const runs: Weekday[][] = [];
    let current: Weekday[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (cur === prev + 1) {
        current.push(cur);
      } else {
        runs.push(current);
        current = [cur];
      }
    }
    runs.push(current);
    const listFmt = new Intl.ListFormat(language, {
      style: "narrow",
      type: "conjunction",
    });
    const parts = runs.map((run) => {
      if (run.length >= 3) {
        return `${label(run[0]!)}${WEEKDAY_RANGE_DASH}${label(run[run.length - 1]!)}`;
      }
      if (run.length === 2) {
        return listFmt.format([label(run[0]!), label(run[1]!)]);
      }
      return label(run[0]!);
    });
    return listFmt.format(parts);
  } catch {
    return sorted.join(" ");
  }
}
