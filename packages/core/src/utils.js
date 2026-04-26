export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const average = (values) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
export const unique = (values) => Array.from(new Set(values));
export const toIso = (value) => typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
//# sourceMappingURL=utils.js.map