import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { downloadCsv } from "./downloadCsv.js";
import { getLocaleConfig } from "./getLocaleConfig.js";
import { runScript } from "./runScript.js";

async function run() {
  const args = yargs(
    hideBin(process.argv).filter((arg) => arg !== "--"),
  ).parseSync() as Record<string, unknown>;
  const locale = String(args.locale ?? "").trim();

  if (!locale) {
    throw new Error("Missing --locale. Example: --locale fr");
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(currentDir, "..");
  const localeConfig = getLocaleConfig(workspaceRoot, locale);

  mkdirSync(path.join(workspaceRoot, "parseCsv/csv"), { recursive: true });
  mkdirSync(path.join(workspaceRoot, "parseCsv/output"), { recursive: true });
  mkdirSync(
    path.join(workspaceRoot, "importCatalogue/expert-brands/sku-group/output"),
    { recursive: true },
  );

  console.info("[syncCatalogue] starting sync", {
    locale: localeConfig.outputLocale,
    sourceLocale: localeConfig.sourceLocale,
    csvUrl: localeConfig.csvUrl,
  });

  await downloadCsv(localeConfig.csvUrl, localeConfig.csvPath);

  await runScript({
    workspaceRoot,
    scriptPath: path.join(workspaceRoot, "parseCsv/main.ts"),
    scriptArgs: [
      "--csv-path",
      localeConfig.csvPath,
      "--csv-locale",
      localeConfig.outputLocale,
      "--dump-path",
      localeConfig.ndjsonPath,
      "--report-path",
      localeConfig.parseReportPath,
    ],
  });

  await runScript({
    workspaceRoot,
    scriptPath: path.join(
      workspaceRoot,
      "importCatalogue/expert-brands/sku-group/main.ts",
    ),
    tsxArgs: ["--env-file", path.join(workspaceRoot, ".env.local")],
    scriptArgs: [
      "--ndjson-path",
      localeConfig.ndjsonPath,
      "--changed-ndjson-path",
      localeConfig.changedNdjsonPath,
      "--diff-report-path",
      localeConfig.diffReportPath,
      "--report-path",
      localeConfig.importReportPath,
    ],
  });

  console.info("[syncCatalogue] sync completed", {
    locale: localeConfig.outputLocale,
    csvPath: localeConfig.csvPath,
    ndjsonPath: localeConfig.ndjsonPath,
    importReportPath: localeConfig.importReportPath,
  });
}

run().catch((error) => {
  console.error("[syncCatalogue] failed", error);
  process.exitCode = 1;
});
