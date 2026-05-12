import { normalizeValue } from "./normalizeValue.js";

export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}
