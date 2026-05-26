import { normalizeBrandTermUid } from "../../brandTerm.js";
import { DatasetSkuGroup } from "../../dataset.types.js";
import { shouldExcludeKiprunSkuGroup } from "./kiprun.js";
import { shouldExcludeSimondSkuGroup } from "./simond.js";
import { shouldExcludeVanRyselSkuGroup } from "./vanRysel.js";

const brandExclusionCheckers: Record<
  string,
  (skuGroup: DatasetSkuGroup) => boolean
> = {
  kiprun: shouldExcludeKiprunSkuGroup,
  simond: shouldExcludeSimondSkuGroup,
  van_rysel: shouldExcludeVanRyselSkuGroup,
};

export function shouldExcludeSkuGroup(skuGroup: DatasetSkuGroup): boolean {
  const normalizedBrand = normalizeBrandTermUid(skuGroup.brand);
  if (!normalizedBrand) {
    return false;
  }

  const checker = brandExclusionCheckers[normalizedBrand];
  if (!checker) {
    return false;
  }

  return checker(skuGroup);
}
