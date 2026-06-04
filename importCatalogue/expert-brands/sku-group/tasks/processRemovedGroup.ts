import { DatasetSkuGroup } from "../../dataset.types.js";
import { BrandsLocale } from "../../types.js";
import { addRemovedTag } from "../addRemovedTag.js";
import { importSkuGroup } from "../import.js";

export async function processRemovedGroup(params: {
  index: number;
  total: number;
  label: string;
  skuGroup: DatasetSkuGroup;
  locale: BrandsLocale;
}) {
  const startTime = Date.now();

  console.info(
    `${params.index + 1}/${params.total} Processing removed sku group: ${params.label}`,
  );

  await importSkuGroup(addRemovedTag(params.skuGroup), params.locale, {
    keepUnpublished: true,
    keepUnpublishedReason: "removed",
    reduceBurst: true,
    requireExisting: true,
  });

  return {
    durationMs: Date.now() - startTime,
  };
}
