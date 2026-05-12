export function formatDetails(details: unknown): string | undefined {
  if (!details) {
    return undefined;
  }

  if (typeof details === "string") {
    return details;
  }

  if (Array.isArray(details)) {
    return details
      .map((item) => {
        const formatted = formatDetails(item);
        if (formatted) {
          return formatted;
        }

        if (typeof item === "object" && item !== null) {
          return JSON.stringify(item) ?? "undefined";
        }

        return item === undefined ? "undefined" : String(item);
      })
      .join(", ");
  }

  if (typeof details === "object") {
    const entries = Object.entries(details as Record<string, unknown>).map(
      ([key, value]) => {
        const formatted = formatDetails(value);
        const fallback =
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value === undefined
              ? "undefined"
              : String(value);
        return `${key}: ${formatted ?? fallback}`;
      },
    );
    return entries.join(" | ");
  }

  return String(details);
}
