import path from "node:path";
import yargs from "yargs/yargs";

import { buildTasks } from "./tasks/buildTasks.js";
import { getNdjsonPath } from "./getNdjsonPath.js";
import { getLatestPath } from "./getLatestPath.js";
import { getLocaleConfig } from "./getLocaleConfig.js";
import { readNdjson } from "./diff/readNdjson.js";
import { runDiff } from "./diff/runDiff.js";
import { updateLatest } from "./diff/updateLatest.js";
import { getChangedPath } from "./diff/getChangedPath.js";
import { getReportPath } from "./diff/getReportPath.js";
import { importFile } from "./tasks/importFile.js";
import { processRemovedGroup } from "./tasks/processRemovedGroup.js";
import { formatError } from "./report/formatError.js";
import { recordError } from "./report/recordError.js";
import { saveReport } from "./report/saveReport.js";
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
  const reduceBurst = true;

  const {
    localeToken,
    localeOverride,
    localeAvailability,
  } = getLocaleConfig(ndjsonPath);
  const importReportPath = String(
    args["report-path"] ??
      args.reportPath ??
      path.join(
        process.cwd(),
        "importCatalogue/expert-brands/sku-group/output",
        `import-report-${localeToken}.json`,
      ),
  );

  const rawCurrentGroups = readNdjson<DatasetSkuGroup>(ndjsonPath);
  const { includedGroups: importableGroups, excludedGroups } =
    applyBrandRulesToGroups(rawCurrentGroups, localeOverride);

  const { changedGroups, currentGroups, removedGroups, report } = runDiff({
    currentGroups: importableGroups,
    currentPath: ndjsonPath,
    latestPath,
    changedPath,
    reportPath: diffReportPath,
  });

  console.info("[importCatalogue] import source", {
    ndjsonPath,
    latestPath,
    changedPath,
    diffReportPath,
    localeToken,
    locale: localeOverride,
    localeAvailability,
    rawSkuGroups: rawCurrentGroups.length,
    excludedSkuGroups: excludedGroups.length,
    importableSkuGroups: importableGroups.length,
    reduceBurst,
  });
  console.info("[importCatalogue] diff summary", report.summary);

  const skuGroupTasks = buildTasks({
    groups: changedGroups,
    localeToken,
    localeOverride,
    localeAvailability,
  });

  if (!skuGroupTasks.length) {
    console.info("[importCatalogue] no changed sku groups detected.");
  }

  let countImportedSkuGroups = 0;
  const importDurationsMs: number[] = [];
  const importErrors: Array<{
    file: string;
    phase: "initial" | "final";
    message: string;
  }> = [];
  const missingTaxonomyTerms = new Map<string, Set<string>>();
  const missingTaxonomyByFile = new Map<string, Set<string>>();

  for (const [index, task] of skuGroupTasks.entries()) {
    try {
      const result = await importFile({
        index,
        total: skuGroupTasks.length,
        label: task.label,
        skuGroup: task.data,
        locale: task.localeOverride,
        importOptions: {
          reduceBurst,
        },
      });

      if (result.imported) {
        countImportedSkuGroups += 1;
        importDurationsMs.push(result.durationMs);
        if (countImportedSkuGroups % 10 === 0) {
          console.info(
            `Imported ${countImportedSkuGroups} sku groups. Median time: ${Math.round(
              importDurationsMs.reduce((sum, duration) => sum + duration, 0) /
                importDurationsMs.length,
            )}ms`,
          );
        }
      }
    } catch (error) {
      console.warn(formatError(task.label, error, "initial"));
      recordError({
        fileName: task.label,
        err: error,
        phase: "initial",
        importErrors,
        missingTaxonomyTerms,
        missingTaxonomyByFile,
      });
      console.info(`Retry importing sku group from file: ${task.label}`);

      try {
        const result = await importFile({
          index,
          total: skuGroupTasks.length,
          label: task.label,
          skuGroup: task.data,
          locale: task.localeOverride,
          importOptions: {
            reduceBurst,
          },
        });

        if (result.imported) {
          countImportedSkuGroups += 1;
          importDurationsMs.push(result.durationMs);
        }
      } catch (retryError) {
        console.error(formatError(task.label, retryError, "final"));
        recordError({
          fileName: task.label,
          err: retryError,
          phase: "final",
          importErrors,
          missingTaxonomyTerms,
          missingTaxonomyByFile,
        });
      }
    }
  }

  for (const [index, skuGroup] of removedGroups.entries()) {
    const label = `${localeToken}_${skuGroup.id}_removed.ndjson`;

    try {
      await processRemovedGroup({
        index,
        total: removedGroups.length,
        label,
        skuGroup,
        locale: localeOverride,
      });
    } catch (error) {
      console.error(formatError(label, error, "final"));
      recordError({
        fileName: label,
        err: error,
        phase: "final",
        importErrors,
        missingTaxonomyTerms,
        missingTaxonomyByFile,
      });
    }
  }

  console.info("All tasks completed.");
  saveReport({
    reportPath: importReportPath,
    importErrors,
    missingTaxonomyTerms,
    missingTaxonomyByFile,
  });

  if (importErrors.length === 0) {
    updateLatest(currentGroups, latestPath);
    console.info("[importCatalogue] latest snapshot updated", {
      latestPath,
      importedSkuGroups: skuGroupTasks.length,
      currentSkuGroups: currentGroups.length,
    });
  } else {
    console.warn(
      "[importCatalogue] latest snapshot not updated because import errors were recorded.",
    );
  }
})().catch((error) => {
  console.error("[importCatalogue] import failed", error);
  process.exitCode = 1;
});
