export function normalizeCategory(category: string): string {
  return category.toLowerCase().replace(/__/g, "_");
}
