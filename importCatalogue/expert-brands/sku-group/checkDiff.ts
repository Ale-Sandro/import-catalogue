import yargs from "yargs/yargs";

import { getChangedPath } from "./diff/getChangedPath.js";
import { getReportPath } from "./diff/getReportPath.js";
import { readNdjson } from "./diff/readNdjson.js";
import { runDiff } from "./diff/runDiff.js";
import { getLatestPath } from "./getLatestPath.js";
import { getLocaleConfig } from "./getLocaleConfig.js";
import { getNdjsonPath } from "./getNdjsonPath.js";
import { DatasetSkuGroup } from "../dataset.types.js";
import { applyBrandRulesToGroups } from "./brands/index.js";

const rawCliArgs = process.argv.slice(2).filter((arg) => arg !== "--");

(async () => {
  const args = yargs(rawCliArgs).parseSync() as Record<string, unknown>;
  const ndjsonPath = getNdjsonPath(args);
  const latestPath = getLatestPath(args, ndjsonPath);
  const changedPath = String(
    args["changed-ndjson-path"] ??
      args.changedNdjsonPath ??
      getChangedPath(ndjsonPath),
  );
  const diffReportPath = String(
    args["diff-report-path"] ??
      args.diffReportPath ??
      getReportPath(ndjsonPath),
  );
  const { localeToken, localeOverride } = getLocaleConfig(ndjsonPath);
  const rawCurrentGroups = readNdjson<DatasetSkuGroup>(ndjsonPath);
  const { includedGroups: currentGroups, excludedGroups } =
    applyBrandRulesToGroups(rawCurrentGroups, localeOverride);

  const { report } = runDiff({
    currentGroups,
    currentPath: ndjsonPath,
    latestPath,
    changedPath,
    reportPath: diffReportPath,
  });

  console.info("[importCatalogue] diff completed", {
    ndjsonPath,
    latestPath,
    changedPath,
    diffReportPath,
    localeToken,
    locale: localeOverride,
    rawSkuGroups: rawCurrentGroups.length,
    excludedSkuGroups: excludedGroups.length,
    importableSkuGroups: currentGroups.length,
  });
  console.info("[importCatalogue] diff summary", report.summary);
})().catch((error) => {
  console.error("[importCatalogue] diff failed", error);
  process.exitCode = 1;
});
