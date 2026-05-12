import { buildPath } from "./buildPath.js";

export function getChangedPath(ndjsonPath: string): string {
  return buildPath(
    ndjsonPath,
    "parsed-catalogue",
    "changed-catalogue",
    ".ndjson",
  );
}
