import { ReferencedEntry } from "../contentstack/types";

import { SkuGroup } from "./contentstack.types";

export const BRAND_LOCALES = [
  "en",
  "en-us",
  "us",
  "en-gb",
  "gb",
  "fr",
  "fr-fr",
  "de",
  "de-de",
  "es",
  "es-es",
  "it",
  "it-it",
] as const;
export type BrandsLocale = (typeof BRAND_LOCALES)[number];

const LOCALE_ALIASES: Record<string, BrandsLocale> = {
  en: "en",
  "en-us": "en-us",
  en_us: "en-us",
  "en-gb": "en",
  en_gb: "en",
  fr: "fr",
  fr_fr: "fr",
  "fr-fr": "fr",
  de: "de",
  de_de: "de",
  "de-de": "de",
  es: "es-es",
  es_es: "es-es",
  "es-es": "es-es",
  it: "it-it",
  it_it: "it-it",
  "it-it": "it-it",
  us: "en-us",
};

const LOCALE_AVAILABILITY_ALIASES: Record<string, BrandsLocale[]> = {
  "en-us": ["us"],
  us: ["us"],
  "en-gb": ["en", "gb"],
  en: ["en", "gb"],
  "fr-fr": ["fr"],
  fr: ["fr"],
  "de-de": ["de"],
  de: ["de"],
  "es-es": ["es"],
  es: ["es"],
  "it-it": ["it"],
  it: ["it"],
};

export type BrandsLocaleInput = keyof typeof LOCALE_ALIASES;

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
    const key = normalizeLocaleKey(locale);
    const availabilityLocales =
      (key && LOCALE_AVAILABILITY_ALIASES[key]) ??
      (key && LOCALE_ALIASES[key] ? [LOCALE_ALIASES[key]] : undefined);

    if (!availabilityLocales) {
      throw new Error(`Unsupported locale '${locale}'`);
    }

    availabilityLocales.forEach((value) => normalizedLocales.add(value));
  }

  return Array.from(normalizedLocales);
}

export type SkuGroupInput = Omit<
  SkuGroup,
  "skus" | "representative_sku"
> & {
  skus: ReferencedEntry[];
  representative_sku: ReferencedEntry[];
};