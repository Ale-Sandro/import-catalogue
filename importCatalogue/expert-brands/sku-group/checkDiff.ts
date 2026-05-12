import yargs from "yargs/yargs";

import { getChangedPath } from "./diff/getChangedPath.js";
import { getReportPath } from "./diff/getReportPath.js";
import { runDiff } from "./diff/runDiff.js";
import { getLatestPath } from "./getLatestPath.js";
import { getLocaleConfig } from "./getLocaleConfig.js";
import { getNdjsonPath } from "./getNdjsonPath.js";

const rawCliArgs = process.argv.slice(2).filter((arg) => arg !== "--");

(async () => {
  const args = yargs(rawCliArgs).parseSync() as Record<string, unknown>;
  const ndjsonPath = getNdjsonPath(args);
  const latestPath = getLatestPath(args);
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

  const { report } = runDiff({
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
  });
  console.info("[importCatalogue] diff summary", report.summary);
})().catch((error) => {
  console.error("[importCatalogue] diff failed", error);
  process.exitCode = 1;
});
