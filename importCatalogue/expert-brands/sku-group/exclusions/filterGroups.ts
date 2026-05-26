import { DatasetSkuGroup } from "../../dataset.types.js";
import { shouldExcludeSkuGroup } from "./index.js";

export function filterExcludedGroups(groups: DatasetSkuGroup[]): {
  includedGroups: DatasetSkuGroup[];
  excludedGroups: DatasetSkuGroup[];
} {
  const includedGroups: DatasetSkuGroup[] = [];
  const excludedGroups: DatasetSkuGroup[] = [];

  for (const group of groups) {
    if (shouldExcludeSkuGroup(group)) {
      excludedGroups.push(group);
      continue;
    }

    includedGroups.push(group);
  }

  return {
    includedGroups,
    excludedGroups,
  };
}
