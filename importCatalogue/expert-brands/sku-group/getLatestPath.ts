import path from "node:path";

export function getLatestPath(
  args: Record<string, unknown>,
): string {
  const explicitPath = String(
    args["latest-path"] ?? args.latestPath ?? "",
  ).trim();
  if (explicitPath) {
    return explicitPath;
  }

  return path.join(
    process.cwd(),
    "importCatalogue/expert-brands/fixtures/latest.ndjson",
  );
}
