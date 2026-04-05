import { ALL_WEEKDAYS, Weekday, sortWeekdays } from "./weekday";

function uniqueWeekdays(days: readonly Weekday[]): Weekday[] {
  return [...new Set(days)];
}

function normalizedExplicitWeekdays(
  days: readonly Weekday[] | undefined
): Weekday[] {
  if (!days?.length) return [];
  return sortWeekdays(uniqueWeekdays(days));
}

/**
 * Canonical persisted weekday semantics:
 * - `undefined` means every day / no restriction
 * - an explicit array means a sorted unique subset
 * - empty and full-week arrays normalize to `undefined`
 */
export function canonicalizeWeekdays(
  days: readonly Weekday[] | undefined
): Weekday[] | undefined {
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

/** Weekly edit state is valid when at least one checkbox remains selected. */
export function hasSelectedWeekdays(
  days: readonly Weekday[] | undefined
): boolean {
  return days === undefined || days.length > 0;
}

/** Persisted schedule semantics: missing/full-set means every day. */
export function isEveryDayWeekdays(
  days: readonly Weekday[] | undefined
): boolean {
  return canonicalizeWeekdays(days) === undefined;
}

export function weekdaysEqual(
  a: readonly Weekday[] | undefined,
  b: readonly Weekday[] | undefined
): boolean {
  const left = canonicalizeWeekdays(a);
  const right = canonicalizeWeekdays(b);
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
  const normalized = canonicalizeWeekdays(days);
  return normalized === undefined || normalized.includes(weekday);
}
