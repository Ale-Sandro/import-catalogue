import { BrandsLocale } from "../../types.js";
import { DatasetSkuGroup } from "../../dataset.types.js";

export function applyLocaleOverrides(
  skuGroup: DatasetSkuGroup,
  localeAvailability: BrandsLocale[],
  locale: BrandsLocale,
): DatasetSkuGroup {
  return {
    ...skuGroup,
    localeAvailability,
    skus: (skuGroup.skus ?? []).map((sku) => ({
      ...sku,
      locale,
    })),
  };
}
