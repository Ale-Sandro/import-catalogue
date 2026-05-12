export type SkuGroupDiffStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "removed";

export type SkuGroupIdentifier = {
  id: string;
  itemGroupId: string | null;
  title: string;
};

export type DiffReportEntry = SkuGroupIdentifier & {
  status: SkuGroupDiffStatus;
};

export type SkuGroupDiffReport = {
  generatedAt: string;
  source: {
    currentPath: string;
    latestPath: string;
  };
  output: {
    changedPath: string;
    reportPath: string;
  };
  summary: {
    current: number;
    latest: number;
    changed: number;
    created: number;
    updated: number;
    unchanged: number;
    removed: number;
  };
  entries: DiffReportEntry[];
};
