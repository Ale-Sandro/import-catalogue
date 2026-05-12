import { publishEntry } from "../../contentstack/api.js";
import { PUBLISH_ENVS } from "../config.js";
import { BrandsLocale } from "../types.js";

export function publish(
  entryUid: string,
  entryVersion: number,
  locale: BrandsLocale,
) {
  return publishEntry("sku_group", entryUid, PUBLISH_ENVS, [locale], entryVersion);
}
