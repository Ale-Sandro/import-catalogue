import { DatasetSkuGroup } from "../../dataset.types.js";
import { getIdentifier } from "./getIdentifier.js";
import { readNdjson } from "./readNdjson.js";
import { stableSerialize } from "./stableSerialize.js";
import { SkuGroupDiffReport, SkuGroupDiffStatus } from "./types.js";
import { writeJson } from "./writeJson.js";
import { writeNdjson } from "./writeNdjson.js";

export function runDiff(params: {
  currentPath: string;
  latestPath: string;
  changedPath: string;
  reportPath: string;
}): {
  changedGroups: DatasetSkuGroup[];
  currentGroups: DatasetSkuGroup[];
  report: SkuGroupDiffReport;
} {
  const currentGroups = readNdjson<DatasetSkuGroup>(params.currentPath);

  let latestGroups: DatasetSkuGroup[] = [];
  try {
    latestGroups = readNdjson<DatasetSkuGroup>(params.latestPath);
  } catch (error) {
    if (!(error instanceof Error) || !/ENOENT/.test(error.message)) {
      throw error;
    }
  }

  const latestById = new Map(
    latestGroups.map((group) => [String(group.id), group] as const),
  );
  const currentIds = new Set<string>();
  const changedGroups: DatasetSkuGroup[] = [];
  const entries: SkuGroupDiffReport["entries"] = [];

  for (const currentGroup of currentGroups) {
    const currentId = String(currentGroup.id);
    currentIds.add(currentId);
    const latestGroup = latestById.get(currentId);
    const status: SkuGroupDiffStatus = !latestGroup
      ? "created"
      : stableSerialize(currentGroup) === stableSerialize(latestGroup)
        ? "unchanged"
        : "updated";

    entries.push({
      ...getIdentifier(currentGroup),
      status,
    });

    if (status === "created" || status === "updated") {
      changedGroups.push(currentGroup);
    }
  }

  for (const latestGroup of latestGroups) {
    const latestId = String(latestGroup.id);
    if (!currentIds.has(latestId)) {
      entries.push({
        ...getIdentifier(latestGroup),
        status: "removed",
      });
    }
  }

  const report: SkuGroupDiffReport = {
    generatedAt: new Date().toISOString(),
    source: {
      currentPath: params.currentPath,
      latestPath: params.latestPath,
    },
    output: {
      changedPath: params.changedPath,
      reportPath: params.reportPath,
    },
    summary: {
      current: currentGroups.length,
      latest: latestGroups.length,
      changed: changedGroups.length,
      created: entries.filter((entry) => entry.status === "created").length,
      updated: entries.filter((entry) => entry.status === "updated").length,
      unchanged: entries.filter((entry) => entry.status === "unchanged").length,
      removed: entries.filter((entry) => entry.status === "removed").length,
    },
    entries,
  };

  writeNdjson(params.changedPath, changedGroups);
  writeJson(params.reportPath, report);

  return {
    changedGroups,
    currentGroups,
    report,
  };
}
