import { buildPath } from "./buildPath.js";

export function getReportPath(ndjsonPath: string): string {
  return buildPath(
    ndjsonPath,
    "parsed-catalogue",
    "diff-report",
    ".json",
  );
}
