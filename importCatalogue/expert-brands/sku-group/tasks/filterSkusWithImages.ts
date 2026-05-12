import { DatasetSkuGroup } from "../../dataset.types.js";
import { hasImages } from "./hasImages.js";

export function filterSkusWithImages(skuGroup: DatasetSkuGroup): {
  filtered: DatasetSkuGroup;
  skipped: number;
} {
  const filteredSkus = skuGroup.skus.filter(hasImages);
  const skipped = skuGroup.skus.length - filteredSkus.length;

  if (skipped === 0) {
    return { filtered: skuGroup, skipped: 0 };
  }

  return {
    filtered: {
      ...skuGroup,
      skus: filteredSkus,
    },
    skipped,
  };
}
