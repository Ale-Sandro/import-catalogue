import { DatasetSkuGroup } from "../../dataset.types.js";
import { BrandsLocale } from "../../types.js";
import { hasImages } from "./hasImages.js";
import { importSkuGroup } from "../import.js";
import { ImportSkuGroupOptions } from "../options.js";

export async function importFile(params: {
  index: number;
  total: number;
  label: string;
  skuGroup: DatasetSkuGroup;
  locale: BrandsLocale;
  importOptions: ImportSkuGroupOptions;
}) {
  const startTime = Date.now();

  console.info(
    `${params.index + 1}/${params.total} Importing sku group from file: ${params.label}`,
  );

  const missingImagesCount = params.skuGroup.skus.filter(
    (sku) => !hasImages(sku),
  ).length;
  const keepUnpublishedReasons = new Set<string>();

  if (missingImagesCount > 0) {
    keepUnpublishedReasons.add("missing_images");
  }

  const hasAtLeastOnePrice = params.skuGroup.skus.some(
    (sku) => sku.price !== null && sku.price !== undefined,
  );
  if (!hasAtLeastOnePrice) {
    keepUnpublishedReasons.add("missing_price");
  }

  if (keepUnpublishedReasons.has("missing_images")) {
    console.info(
      `SKU group ${params.label} has ${missingImagesCount} SKU(s) without images; it will be created/updated but kept unpublished.`,
    );
  }

  if (keepUnpublishedReasons.has("missing_price")) {
    console.info(
      `SKU group ${params.label} has no priced SKU; it will be created/updated but kept unpublished.`,
    );
  }

  const keepUnpublishedReason = Array.from(keepUnpublishedReasons.values()).join(", ");

  await importSkuGroup(params.skuGroup, params.locale, {
    ...params.importOptions,
    keepUnpublished:
      params.importOptions.keepUnpublished || keepUnpublishedReasons.size > 0,
    keepUnpublishedReason:
      keepUnpublishedReason || params.importOptions.keepUnpublishedReason,
  });
  return {
    imported: true,
    durationMs: Date.now() - startTime,
  };
}
