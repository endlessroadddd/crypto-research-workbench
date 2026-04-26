export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

export const toIso = (value: Date | string): string =>
  typeof value === "string" ? new Date(value).toISOString() : value.toISOString();

