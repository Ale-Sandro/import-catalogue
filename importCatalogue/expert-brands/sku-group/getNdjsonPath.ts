import path from "node:path";

import { listNdjsonFiles } from "./listNdjsonFiles.js";

export function getNdjsonPath(
  args: Record<string, unknown>,
): string {
  const explicitPath = String(
    args["ndjson-path"] ?? args.ndjsonPath ?? "",
  ).trim();
  if (explicitPath) {
    return explicitPath;
  }

  const outputDir = path.join(process.cwd(), "parseCsv/output");
  const ndjsonFiles = listNdjsonFiles(outputDir);
  if (!ndjsonFiles.length) {
    throw new Error(
      `No parsed catalogue NDJSON found in ${outputDir}. Use --ndjson-path to specify a file explicitly.`,
    );
  }

  if (ndjsonFiles.length === 1) {
    return path.join(outputDir, ndjsonFiles[0]);
  }

  throw new Error(
    `Multiple NDJSON files found in ${outputDir}: ${ndjsonFiles.join(", ")}. Use --ndjson-path to choose one.`,
  );
}
