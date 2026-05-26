import { DatasetSkuGroup } from "../../dataset.types.js";

export const kiprunExcludedItemGroupIds: string[] = [];

const kiprunExcludedItemGroupIdsSet = new Set(kiprunExcludedItemGroupIds);

export function shouldExcludeKiprunSkuGroup(
  skuGroup: DatasetSkuGroup,
): boolean {
  return kiprunExcludedItemGroupIdsSet.has(String(skuGroup.itemGroupId).trim());
}
