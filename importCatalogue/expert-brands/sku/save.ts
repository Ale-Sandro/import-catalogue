import { createEntry, updateEntry } from "../../contentstack/api.js";
import { EntryInput } from "../../contentstack/types.js";
import { Sku } from "../contentstack.types.js";
import { BrandsLocale } from "../types.js";

export async function save(params: {
  existingSkuUid?: string;
  locale: BrandsLocale;
  skuEntry: EntryInput<Sku>;
}) {
  if (params.existingSkuUid) {
    return updateEntry<Sku>(
      "sku",
      params.existingSkuUid,
      params.skuEntry,
      params.locale,
    );
  }

  return createEntry<Sku>("sku", params.skuEntry, params.locale);
}
