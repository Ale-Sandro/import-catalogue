import { DatasetSku, DatasetSkuGroup } from "../dataset.types.js";
import { BrandsLocale } from "../types.js";
import { buildEntry } from "./buildEntry.js";
import { findExisting } from "./findExisting.js";
import { ImportSkuOptions } from "./options.js";
import { keepUnpublished } from "./keepUnpublished.js";
import { publish } from "./publish.js";
import { save } from "./save.js";

export async function importSku(
  sku: DatasetSku,
  skuGroup: DatasetSkuGroup,
  locale: BrandsLocale,
  options?: ImportSkuOptions,
) {
  const existingSkuResult = await findExisting(locale, sku.skuId);
  const existingSku = existingSkuResult?.entry;

  const skuEntry = buildEntry(sku, skuGroup);

  const savedEntry = await save({
    existingSkuUid: existingSku?.uid,
    locale,
    skuEntry,
  });

  if (savedEntry instanceof Error) {
    throw savedEntry;
  }

  const keepUnpublishedReasons = new Set<string>();
  if (options?.keepUnpublishedReason) {
    keepUnpublishedReasons.add(options.keepUnpublishedReason);
  }
  if (sku.isOutOfStock === true) {
    keepUnpublishedReasons.add("sku_out_of_stock");
  }
  const shouldKeepUnpublished =
    options?.keepUnpublished === true || keepUnpublishedReasons.size > 0;
  const keepUnpublishedReason =
    Array.from(keepUnpublishedReasons.values()).join(", ") || "manual";

  if (shouldKeepUnpublished) {
    await keepUnpublished({
      existingSku,
      savedEntry: savedEntry.entry,
      locale,
      reason: keepUnpublishedReason,
    });
    return savedEntry.entry;
  }

  await publish(savedEntry.entry.uid, savedEntry.entry._version, locale);
  return savedEntry.entry;
}
