import { readdirSync } from "node:fs";

export function listNdjsonFiles(outputDir: string): string[] {
  return readdirSync(outputDir)
    .filter((fileName) => /^parsed-catalogue.*\.ndjson$/i.test(fileName.trim()))
    .sort((left, right) => left.localeCompare(right));
}
