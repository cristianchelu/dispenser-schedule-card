import { ALL_WEEKDAYS, Weekday, sortWeekdays } from "./weekday";

/**
 * Per-device weekday rules. When `allowNever` is true, an empty selection is
 * a valid, distinct "never repeat" state (instead of being collapsed to "every day").
 */
export interface WeekdayPolicy {
  allowNever?: boolean;
}

function uniqueWeekdays(days: readonly Weekday[]): Weekday[] {
  return [...new Set(days)];
}

function normalizedExplicitWeekdays(
  days: readonly Weekday[] | undefined
): Weekday[] {
  if (!days?.length) return [];
  return sortWeekdays(uniqueWeekdays(days));
}

/** Empty selection = "never repeat" (only meaningful when policy.allowNever). */
export function isNeverRepeatWeekdays(
  days: readonly Weekday[] | undefined
): boolean {
  return Array.isArray(days) && days.length === 0;
}

/**
 * Canonical persisted weekday semantics:
 * - `undefined` means every day / no restriction
 * - an explicit array means a sorted unique subset
 * - a full-week array normalizes to `undefined`
 * - an empty array normalizes to `undefined` by default; with
 *   `policy.allowNever`, it survives as `[]` ("never repeat").
 */
export function canonicalizeWeekdays(
  days: readonly Weekday[] | undefined,
  policy?: WeekdayPolicy
): Weekday[] | undefined {
  if (policy?.allowNever && isNeverRepeatWeekdays(days)) {
    return [];
  }
  const normalized = normalizedExplicitWeekdays(days);
  if (normalized.length === 0 || normalized.length === ALL_WEEKDAYS.length) {
    return undefined;
  }
  return normalized;
}

/** Edit-state weekday selection: `undefined` shows as all selected. */
export function getEditableWeekdays(
  days: readonly Weekday[] | undefined
): Weekday[] {
  if (days === undefined) return [...ALL_WEEKDAYS];
  return normalizedExplicitWeekdays(days);
}

/**
 * Weekly edit state is valid when at least one checkbox remains selected,
 * unless the device opts in to `allowNever`, in which case empty is also valid.
 */
export function hasSelectedWeekdays(
  days: readonly Weekday[] | undefined,
  policy?: WeekdayPolicy
): boolean {
  if (policy?.allowNever) return true;
  return days === undefined || days.length > 0;
}

/**
 * Persisted schedule semantics: missing/full-set means every day. Empty
 * arrays are treated as every-day by default; with `policy.allowNever` they
 * are a distinct "never repeat" state and therefore *not* every-day.
 */
export function isEveryDayWeekdays(
  days: readonly Weekday[] | undefined,
  policy?: WeekdayPolicy
): boolean {
  return canonicalizeWeekdays(days, policy) === undefined;
}

export function weekdaysEqual(
  a: readonly Weekday[] | undefined,
  b: readonly Weekday[] | undefined,
  policy?: WeekdayPolicy
): boolean {
  const left = canonicalizeWeekdays(a, policy);
  const right = canonicalizeWeekdays(b, policy);
  if (left === undefined || right === undefined) {
    return left === right;
  }
  if (left.length !== right.length) return false;
  return left.every((day, index) => day === right[index]);
}

/** Returns the next edit-state weekday selection after a checkbox toggle. */
export function toggleEditableWeekday(
  days: readonly Weekday[] | undefined,
  weekday: Weekday,
  checked: boolean
): Weekday[] | undefined {
  const next = new Set(getEditableWeekdays(days));
  if (checked) {
    next.add(weekday);
  } else {
    next.delete(weekday);
  }
  const normalized = sortWeekdays([...next]);
  if (normalized.length === ALL_WEEKDAYS.length) {
    return undefined;
  }
  return normalized;
}

export function appliesOnWeekday(
  days: readonly Weekday[] | undefined,
  weekday: Weekday
): boolean {
  if (isNeverRepeatWeekdays(days)) return false;
  const normalized = canonicalizeWeekdays(days);
  return normalized === undefined || normalized.includes(weekday);
}
