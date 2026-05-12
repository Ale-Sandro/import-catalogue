import { normalizeLocale, normalizeLocaleAvailability } from "../types.js";
import { BrandsLocale } from "../types.js";
import { getLocaleToken } from "./getLocaleToken.js";

export function getLocaleConfig(ndjsonPath: string): {
  localeToken: string;
  localeOverride: BrandsLocale;
  localeAvailability: BrandsLocale[];
} {
  const localeToken = getLocaleToken(ndjsonPath);
  const localeOverride = normalizeLocale(localeToken);
  const localeAvailability = normalizeLocaleAvailability([localeToken]);

  return {
    localeToken,
    localeOverride,
    localeAvailability,
  };
}
