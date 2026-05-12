export function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalizedItems = value.map((item) => normalizeValue(item));
    return normalizedItems.sort((left, right) =>
      JSON.stringify(normalizeValue(left)).localeCompare(
        JSON.stringify(normalizeValue(right)),
      ),
    );
  }

  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const nestedValue = (value as Record<string, unknown>)[key];
      if (nestedValue !== undefined) {
        normalized[key] = normalizeValue(nestedValue);
      }
    }
    return normalized;
  }

  return value;
}
