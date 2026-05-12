import { DatasetSkuGroup } from "../../dataset.types.js";
import { SkuGroupIdentifier } from "./types.js";

export function getIdentifier(
  group: DatasetSkuGroup,
): SkuGroupIdentifier {
  return {
    id: String(group.id),
    itemGroupId: group.itemGroupId ?? null,
    title: String(group.title),
  };
}
