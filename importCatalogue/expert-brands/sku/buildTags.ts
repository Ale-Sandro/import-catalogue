import { DatasetSku } from "../dataset.types.js";
import { normalizeTags } from "../shared/normalizeTags.js";

export function buildTags(dataset: DatasetSku): string[] {
  const extra = [
    ...normalizeTags(dataset.tags ?? undefined),
    ...normalizeTags(dataset.tag ?? undefined),
  ];
  const merged = new Set<string>(["MIGRATED"]);
  extra.forEach((tag) => merged.add(tag));
  return Array.from(merged.values());
}
