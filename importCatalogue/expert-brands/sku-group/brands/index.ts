import { normalizeBrandTermUid } from "../../brandTerm.js";
import { DatasetSkuGroup } from "../../dataset.types.js";
import { BrandsLocale } from "../../types.js";
import { applyKiprunRules } from "./kiprun.js";
import { applySimondRules } from "./simond.js";
import { applyVanRyselRules } from "./vanRysel.js";

const brandRuleHandlers: Record<
  string,
  (skuGroup: DatasetSkuGroup, locale: BrandsLocale) => DatasetSkuGroup | null
> = {
  kiprun: applyKiprunRules,
  simond: applySimondRules,
  van_rysel: applyVanRyselRules,
};

export function applyBrandRules(
  skuGroup: DatasetSkuGroup,
  locale: BrandsLocale,
): DatasetSkuGroup | null {
  const normalizedBrand = normalizeBrandTermUid(skuGroup.brand);
  if (!normalizedBrand) {
    return skuGroup;
  }

  const handler = brandRuleHandlers[normalizedBrand];
  if (!handler) {
    return skuGroup;
  }

  return handler(skuGroup, locale);
}

export function applyBrandRulesToGroups(
  groups: DatasetSkuGroup[],
  locale: BrandsLocale,
): {
  includedGroups: DatasetSkuGroup[];
  excludedGroups: DatasetSkuGroup[];
} {
  const includedGroups: DatasetSkuGroup[] = [];
  const excludedGroups: DatasetSkuGroup[] = [];

  for (const group of groups) {
    const nextGroup = applyBrandRules(group, locale);
    if (!nextGroup) {
      excludedGroups.push(group);
      continue;
    }

    includedGroups.push(nextGroup);
  }

  return {
    includedGroups,
    excludedGroups,
  };
}
