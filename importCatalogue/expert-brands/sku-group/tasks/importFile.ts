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
  const shouldKeepUnpublishedForMissingImages = missingImagesCount > 0;

  if (shouldKeepUnpublishedForMissingImages) {
    console.info(
      `SKU group ${params.label} has ${missingImagesCount} SKU(s) without images; it will be created/updated but kept unpublished.`,
    );
  }

  await importSkuGroup(params.skuGroup, params.locale, {
    ...params.importOptions,
    keepUnpublished:
      params.importOptions.keepUnpublished || shouldKeepUnpublishedForMissingImages,
    keepUnpublishedReason: shouldKeepUnpublishedForMissingImages
      ? "missing_images"
      : params.importOptions.keepUnpublishedReason,
  });
  return {
    imported: true,
    durationMs: Date.now() - startTime,
  };
}
