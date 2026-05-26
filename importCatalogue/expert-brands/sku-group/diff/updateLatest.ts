import { DatasetSkuGroup } from "../../dataset.types.js";
import { writeNdjson } from "./writeNdjson.js";

export function updateLatest(currentGroups: DatasetSkuGroup[], latestPath: string) {
  writeNdjson(latestPath, currentGroups);
}
