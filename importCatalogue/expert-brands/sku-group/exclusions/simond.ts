import { DatasetSkuGroup } from "../../dataset.types.js";

export const simondExcludedItemGroupIds: string[] = [];

const simondExcludedItemGroupIdsSet = new Set(simondExcludedItemGroupIds);

export function shouldExcludeSimondSkuGroup(
  skuGroup: DatasetSkuGroup,
): boolean {
  return simondExcludedItemGroupIdsSet.has(String(skuGroup.itemGroupId).trim());
}
