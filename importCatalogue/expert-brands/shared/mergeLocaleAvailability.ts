export function mergeLocaleAvailability(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] {
  const merged = new Set<string>();
  (existing ?? []).forEach((value) => merged.add(String(value)));
  (incoming ?? []).forEach((value) => merged.add(String(value)));
  return Array.from(merged.values());
}
