export const BRAND_TAXONOMY_UID = "brand";

export function normalizeBrandTermUid(
  brand: string | null | undefined,
): string | null {
  const trimmed = brand?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || null;
}

export function buildBrandTerm(brand: string | null | undefined): {
  taxonomy_uid: string;
  term_uid: string;
} {
  const termUid = normalizeBrandTermUid(brand);
  if (!termUid) {
    throw new Error("Missing brand taxonomy term uid");
  }

  return {
    taxonomy_uid: BRAND_TAXONOMY_UID,
    term_uid: termUid,
  };
}
