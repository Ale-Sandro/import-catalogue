import { DatasetSkuGroup } from "../dataset.types.js";
import { normalizeTags } from "../shared/normalizeTags.js";

function mergeRemovedTags(
  tags: string[] | null | undefined,
  tag: string | null | undefined,
): string[] {
  return Array.from(
    new Set<string>([...normalizeTags(tags), ...normalizeTags(tag), "removed"]),
  );
}

export function addRemovedTag(skuGroup: DatasetSkuGroup): DatasetSkuGroup {
  return {
    ...skuGroup,
    tags: mergeRemovedTags(skuGroup.tags, skuGroup.tag),
    skus: skuGroup.skus.map((sku) => ({
      ...sku,
      tags: mergeRemovedTags(sku.tags, sku.tag),
    })),
  };
}
