import { DatasetSkuGroup } from "../../dataset.types.js";
import { BrandsLocale } from "../../types.js";
import { shouldExcludeVanRyselSkuGroup } from "../exclusions/vanRysel.js";

export function applyVanRyselRules(
  skuGroup: DatasetSkuGroup,
  _locale: BrandsLocale,
): DatasetSkuGroup | null {
  if (shouldExcludeVanRyselSkuGroup(skuGroup)) {
    return null;
  }

  return skuGroup;
}
