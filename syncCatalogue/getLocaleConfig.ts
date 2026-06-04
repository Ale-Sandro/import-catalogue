import path from "node:path";

type SyncLocaleConfig = {
  sourceLocale: string;
  outputLocale: string;
  csvUrl: string;
  csvPath: string;
  ndjsonPath: string;
  parseReportPath: string;
  changedNdjsonPath: string;
  diffReportPath: string;
  importReportPath: string;
};

const CSV_BASE_URL =
  "https://xmerch-syndication-export.x-merch-common.decathlon.net/contentstack";

const LOCALE_CONFIGS: Record<
  string,
  { sourceLocale: string; outputLocale: string }
> = {
  fr: { sourceLocale: "fr-FR", outputLocale: "fr" },
  "fr-fr": { sourceLocale: "fr-FR", outputLocale: "fr" },
  "fr-ca": { sourceLocale: "fr-CA", outputLocale: "fr-ca" },
  en: { sourceLocale: "en-GB", outputLocale: "en" },
  "en-gb": { sourceLocale: "en-GB", outputLocale: "en" },
  "en-us": { sourceLocale: "en-US", outputLocale: "en-us" },
  "en-ca": { sourceLocale: "en-CA", outputLocale: "en-ca" },
  de: { sourceLocale: "de-DE", outputLocale: "de" },
  "de-de": { sourceLocale: "de-DE", outputLocale: "de" },
  "es-es": { sourceLocale: "es-ES", outputLocale: "es-es" },
  "it-it": { sourceLocale: "it-IT", outputLocale: "it-it" },
};

function normalizeLocaleToken(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

export function getLocaleConfig(
  workspaceRoot: string,
  localeInput: string,
): SyncLocaleConfig {
  const localeKey = normalizeLocaleToken(localeInput);
  const localeConfig = LOCALE_CONFIGS[localeKey];

  if (!localeConfig) {
    throw new Error(
      `Unsupported locale '${localeInput}'. Expected one of: ${Object.keys(
        LOCALE_CONFIGS,
      ).join(", ")}`,
    );
  }

  const csvFileName = `${localeConfig.sourceLocale}_contentstack-exporter.csv`;

  return {
    sourceLocale: localeConfig.sourceLocale,
    outputLocale: localeConfig.outputLocale,
    csvUrl: `${CSV_BASE_URL}/${csvFileName}`,
    csvPath: path.join(workspaceRoot, "parseCsv/csv", csvFileName),
    ndjsonPath: path.join(
      workspaceRoot,
      "parseCsv/output",
      `parsed-catalogue-${localeConfig.outputLocale}.ndjson`,
    ),
    parseReportPath: path.join(
      workspaceRoot,
      "parseCsv/output",
      `parse-report-${localeConfig.outputLocale}.json`,
    ),
    changedNdjsonPath: path.join(
      workspaceRoot,
      "importCatalogue/expert-brands/sku-group/output",
      `changed-catalogue-${localeConfig.outputLocale}.ndjson`,
    ),
    diffReportPath: path.join(
      workspaceRoot,
      "importCatalogue/expert-brands/sku-group/output",
      `diff-report-${localeConfig.outputLocale}.json`,
    ),
    importReportPath: path.join(
      workspaceRoot,
      "importCatalogue/expert-brands/sku-group/output",
      `import-report-${localeConfig.outputLocale}.json`,
    ),
  };
}
