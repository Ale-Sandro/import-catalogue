import path from "node:path";
import { getLocaleToken } from "./getLocaleToken.js";

export function getLatestPath(
  args: Record<string, unknown>,
  ndjsonPath: string,
): string {
  const explicitPath = String(
    args["latest-path"] ?? args.latestPath ?? "",
  ).trim();
  if (explicitPath) {
    return explicitPath;
  }

  const localeToken = getLocaleToken(ndjsonPath);

  return path.join(
    process.cwd(),
    "importCatalogue/expert-brands/fixtures",
    `latest-${localeToken}.ndjson`,
  );
}
