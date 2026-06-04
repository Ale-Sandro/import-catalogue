import { DatasetSkuGroup } from "../../dataset.types.js";
import { BrandsLocale } from "../../types.js";
import { shouldExcludeKiprunSkuGroup } from "../exclusions/kiprun.js";

export function applyKiprunRules(
  skuGroup: DatasetSkuGroup,
  _locale: BrandsLocale,
): DatasetSkuGroup | null {
  if (shouldExcludeKiprunSkuGroup(skuGroup)) {
    return null;
  }

  return skuGroup;
}
