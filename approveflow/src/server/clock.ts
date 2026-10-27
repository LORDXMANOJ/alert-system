/**
 * Demonstration clock. Every date calculation in the app uses now() so the demo can be
 * shifted forward (Demo Control) and still show meaningful overdue and expiry cases.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

let offsetDays = 0;

export function setClockOffsetDays(days: number): void {
  offsetDays = days;
}

export function getClockOffsetDays(): number {
  return offsetDays;
}

export function now(): Date {
  return new Date(Date.now() + offsetDays * DAY_MS);
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export const DAY = DAY_MS;
