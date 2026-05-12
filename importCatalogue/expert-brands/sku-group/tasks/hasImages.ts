import { DatasetSkuGroup } from "../../dataset.types.js";

export function hasImages(
  sku: DatasetSkuGroup["skus"][number],
): boolean {
  return Boolean(sku.productImages && sku.productImages.length > 0);
}
