import { ReferencedEntry } from "../contentstack/types.js";

import { SkuGroup } from "./contentstack.types.js";

export const BRAND_LOCALES = [
  "en",
  "en-us",
  "en-ca",
  "fr",
  "fr-ca",
  "de",
  "es-es",
  "it-it",
] as const;
export type BrandsLocale = (typeof BRAND_LOCALES)[number];

const LOCALE_ALIASES: Record<string, BrandsLocale> = {
  en: "en",
  "en-us": "en-us",
  "en-ca": "en-ca",
  fr: "fr",
  "fr-ca": "fr-ca",
  de: "de",
  "es-es": "es-es",
  "it-it": "it-it",
};

export type BrandsLocaleInput = BrandsLocale;

function normalizeLocaleKey(locale: string) {
  return locale?.trim().toLowerCase().replace(/_/g, "-");
}

export function normalizeLocale(locale: string): BrandsLocale {
  const normalized = LOCALE_ALIASES[normalizeLocaleKey(locale)];
  if (!normalized) {
    throw new Error(`Unsupported locale '${locale}'`);
  }
  return normalized;
}

export function normalizeLocaleAvailability(
  locales: readonly string[],
): BrandsLocale[] {
  const normalizedLocales = new Set<BrandsLocale>();

  for (const locale of locales) {
    normalizedLocales.add(normalizeLocale(locale));
  }

  return Array.from(normalizedLocales);
}

export type SkuGroupInput = Omit<SkuGroup, "skus" | "representative_sku"> & {
  skus: ReferencedEntry[];
  representative_sku: ReferencedEntry[];
};
