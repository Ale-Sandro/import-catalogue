import { DatasetSkuGroup } from "../../dataset.types.js";
import { normalizeTags } from "../../shared/normalizeTags.js";
import { BrandsLocale } from "../../types.js";

export const simondExcludedItemGroupIds: readonly string[] = [];

const simondExcludedItemGroupIdsSet = new Set(simondExcludedItemGroupIds);

const AGE_RESTRICTED_PRODUCT_NATURE_IDS = new Set([
  "25728",
  "11242",
  "11244",
  "10309",
  "25827",
]);

function addTag(skuGroup: DatasetSkuGroup, tag: string): DatasetSkuGroup {
  const tags = Array.from(
    new Set<string>([...normalizeTags(skuGroup.tags), ...normalizeTags(skuGroup.tag), tag]),
  );

  return {
    ...skuGroup,
    tags,
  };
}

export function applySimondRules(
  skuGroup: DatasetSkuGroup,
  locale: BrandsLocale,
): DatasetSkuGroup | null {
  if (simondExcludedItemGroupIdsSet.has(String(skuGroup.itemGroupId).trim())) {
    return null;
  }

  if (
    locale === "en"
    && AGE_RESTRICTED_PRODUCT_NATURE_IDS.has(
      String(skuGroup.productNatureId ?? "").trim(),
    )
  ) {
    return addTag(skuGroup, "age_restricted");
  }

  return skuGroup;
}
