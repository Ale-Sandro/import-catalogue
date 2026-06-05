import { DatasetSkuGroup } from "../../dataset.types.js";
import { BrandsLocale } from "../../types.js";

export const kiprunExcludedItemGroupIds: readonly string[] = [];

const kiprunExcludedItemGroupIdsSet = new Set(kiprunExcludedItemGroupIds);

export function applyKiprunRules(
  skuGroup: DatasetSkuGroup,
  _locale: BrandsLocale,
): DatasetSkuGroup | null {
  if (kiprunExcludedItemGroupIdsSet.has(String(skuGroup.itemGroupId).trim())) {
    return null;
  }

  return skuGroup;
}
