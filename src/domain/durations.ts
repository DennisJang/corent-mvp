// MVP supports three rental windows. Kept as a constant table so UI and
// parsers share the same source of truth.

export type DurationDays = 1 | 3 | 7;
export type DurationKey = "1d" | "3d" | "7d";

export type DurationDef = {
  key: DurationKey;
  days: DurationDays;
  label: string;
  capLabel: string;
};

export const DURATIONS: DurationDef[] = [
  { key: "1d", days: 1, label: "1일", capLabel: "01 / DAY" },
  { key: "3d", days: 3, label: "3일", capLabel: "03 / DAYS" },
  { key: "7d", days: 7, label: "7일", capLabel: "07 / DAYS" },
];

export const DEFAULT_DURATION: DurationKey = "3d";

export function durationDaysToKey(days: number): DurationKey | undefined {
  return DURATIONS.find((d) => d.days === days)?.key;
}

export function keyToDays(key: DurationKey): DurationDays {
  return DURATIONS.find((d) => d.key === key)!.days;
}
