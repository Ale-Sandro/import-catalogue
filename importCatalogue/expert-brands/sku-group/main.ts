import { ConcurrentPromiseQueue } from "concurrent-promise-queue";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DatasetSkuGroup } from "../dataset.types";
import { BrandsLocale, normalizeLocale } from "../types";
import { importSkuGroup } from "./services";
import { EXCLUDED_SUPERMODEL_CODES } from "./exclusions";

const rawCliArgs = process.argv.slice(2).filter((arg) => arg !== "--");

function hasCliFlag(name: string): boolean {
  return rawCliArgs.includes(`--${name}`);
}

function readNdjson<T>(filePath: string): T[] {
  const raw = readFileSync(filePath, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function parseListArg(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : undefined;
}

function applyLocaleOverrides(
  skuGroup: DatasetSkuGroup,
  localeAvailability: string[],
  localeRaw: string,
): DatasetSkuGroup {
  return {
    ...skuGroup,
    localeAvailability,
    skus: (skuGroup.skus ?? []).map((sku) => ({
      ...sku,
      locale: localeRaw,
      localeAvailability,
    })),
  };
}

const reduceBurst = hasCliFlag("reduce-burst");
const queue = new ConcurrentPromiseQueue({
  maxNumberOfConcurrentPromises: reduceBurst ? 1 : 2,
});

let countImportedSkuGroups = 0;
const medianTimeImportBySkuGroup: number[] = [];
const importErrors: Array<{
  file: string;
  phase: "initial" | "final";
  message: string;
}> = [];
const missingTaxonomyTerms = new Map<string, Set<string>>();
const missingTaxonomyByFile = new Map<string, Set<string>>();
const preserveImages = hasCliFlag("preserve-images");
const preserveCategories = hasCliFlag("preserve-categories");
const skipPublishIfUnpublished = hasCliFlag("skip-publish-if-unpublished");
const publishIfPublishedAnywhere = hasCliFlag("publish-if-published-anywhere");
const debugPublishStatus = hasCliFlag("debug-publish-status");
let preserveImagesForCategories: string[] | undefined;
const DEFAULT_NDJSON_LOCALE = "en_US";
const DEFAULT_NDJSON_LOCALE_AVAILABILITY = ["us"];

type SkuGroupTask = {
  label: string;
  data: DatasetSkuGroup;
  localeOverride: BrandsLocale;
};

function hasSkuImages(sku: DatasetSkuGroup["skus"][number]): boolean {
  return Boolean(sku.productImages && sku.productImages.length > 0);
}

function filterSkuGroupSkusWithImages(skuGroup: DatasetSkuGroup): {
  filtered: DatasetSkuGroup;
  skipped: number;
} {
  const filteredSkus = skuGroup.skus.filter(hasSkuImages);
  const skipped = skuGroup.skus.length - filteredSkus.length;
  if (skipped === 0) {
    return { filtered: skuGroup, skipped: 0 };
  }
  return {
    filtered: {
      ...skuGroup,
      skus: filteredSkus,
    },
    skipped,
  };
}

function truncate(text: string, max = 300): string {
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatDetails(details: unknown): string | undefined {
  if (!details) {
    return undefined;
  }

  if (typeof details === "string") {
    return details;
  }

  if (Array.isArray(details)) {
    return details
      .map((item) => {
        const formatted = formatDetails(item);
        if (formatted) {
          return formatted;
        }
        if (typeof item === "object" && item !== null) {
          const json = JSON.stringify(item);
          return json ?? "undefined";
        }
        return item === undefined ? "undefined" : String(item);
      })
      .join(", ");
  }

  if (typeof details === "object") {
    const entries = Object.entries(details as Record<string, unknown>).map(
      ([key, value]) => {
        const formatted = formatDetails(value);
        const fallback =
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value === undefined
              ? "undefined"
              : String(value);
        return `${key}: ${formatted ?? fallback}`;
      },
    );
    return entries.join(" | ");
  }

  return String(details);
}

function formatImportErrorMessage(
  fileName: string,
  err: unknown,
  phase: "initial" | "final",
): string {
  const prefix =
    phase === "initial"
      ? `Attempt failed importing ${fileName}`
      : `Failed importing ${fileName} after retry`;

  if (!err || typeof err !== "object") {
    return `${prefix}: ${String(err)}`;
  }

  const errorObj = err as {
    message?: string;
    status?: number;
    error_code?: number | string;
    details?: unknown;
  };

  const message =
    err instanceof Error
      ? err.message
      : (errorObj.message ?? "Unknown error from Contentstack");
  const status = errorObj.status;
  const errorCode = errorObj.error_code;
  const details = formatDetails(errorObj.details);

  const contextParts = [
    status ? `status ${status}` : null,
    errorCode ? `code ${errorCode}` : null,
  ].filter(Boolean);

  const context =
    contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";

  const detailSuffix = details ? ` - ${truncate(details)}` : "";

  return `${prefix}${context}: ${truncate(message)}${detailSuffix}`;
}

function collectMissingTaxonomy(fileName: string, details: unknown) {
  if (
    !details ||
    typeof details !== "object" ||
    details === null ||
    !("terms" in details)
  ) {
    return;
  }

  const { terms: termsField } = details as { terms?: unknown };
  if (termsField === undefined) {
    return;
  }

  const termEntries = Array.isArray(termsField) ? termsField : [termsField];

  for (const entry of termEntries) {
    if (typeof entry !== "string") {
      continue;
    }

    const match = entry.match(/does not exist:\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const rawList = match[1];
    const rawTerms = rawList.split(",").map((term) => term.trim());

    for (const rawTerm of rawTerms) {
      if (!rawTerm) {
        continue;
      }

      const termMatch = rawTerm.match(/^([a-z0-9_]+)(?:\(([^)]+)\))?$/i);
      if (!termMatch) {
        continue;
      }

      const [, termUid, taxonomy = "unknown"] = termMatch;
      const taxonomyTerms =
        missingTaxonomyTerms.get(taxonomy) ?? new Set<string>();
      taxonomyTerms.add(termUid);
      missingTaxonomyTerms.set(taxonomy, taxonomyTerms);

      const fileTerms = missingTaxonomyByFile.get(fileName) ?? new Set<string>();
      fileTerms.add(termUid);
      missingTaxonomyByFile.set(fileName, fileTerms);
    }
  }
}

function recordImportError(
  fileName: string,
  err: unknown,
  phase: "initial" | "final",
) {
  if (!err || typeof err !== "object") {
    importErrors.push({
      file: fileName,
      phase,
      message: `${phase} error: ${String(err)}`,
    });
    return;
  }

  const errorObj = err as {
    details?: unknown;
  };

  collectMissingTaxonomy(fileName, errorObj.details);
  importErrors.push({
    file: fileName,
    phase,
    message: formatImportErrorMessage(fileName, err, phase),
  });
}

function persistSummaryReport(reportPath: string) {
  if (!importErrors.length && missingTaxonomyTerms.size === 0) {
    return;
  }

  mkdirSync(path.dirname(reportPath), { recursive: true });

  const errorsPayload = importErrors.map((error) => ({
    file: error.file,
    phase: error.phase,
    message: error.message,
    missingTaxonomyTerms: Array.from(
      (missingTaxonomyByFile.get(error.file) ?? new Set<string>()).values(),
    ).sort(),
  }));

  const missingTaxonomiesPayload = Array.from(
    missingTaxonomyTerms.entries(),
  ).map(([taxonomy, terms]) => ({
    taxonomy,
    terms: Array.from(terms.values()).sort(),
  }));

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    errors: errorsPayload,
    missingTaxonomies: missingTaxonomiesPayload,
  };

  writeFileSync(reportPath, JSON.stringify(reportPayload, null, 2), "utf-8");
  console.info(`Import report saved to ${reportPath}`);
}

async function importSkuGroupFile(
  task: SkuGroupTask,
  index: number,
  total: number,
): Promise<void> {
  const startTime = Date.now();
  const fileName = task.label;

  console.info(
    `${Number(index) + 1}/${total} Importing sku group from file: ${fileName}`,
  );

  const locale = task.localeOverride;
  const skuGroup = task.data;
  const { filtered: skuGroupWithImages, skipped } =
    filterSkuGroupSkusWithImages(skuGroup);
  if (EXCLUDED_SUPERMODEL_CODES.has(String(skuGroup.itemGroupId))) {
    console.info(
      `Skipping excluded SKU Group itemGroupId=${skuGroup.itemGroupId} from file: ${fileName}`,
    );
    return;
  }

  if (skipped > 0) {
    console.info(`Skipping ${skipped} SKU(s) without images for file: ${fileName}`);
  }

  if (!skuGroupWithImages.skus.length) {
    console.info(
      `Skipping sku group from file: ${fileName} because no SKUs with images.`,
    );
    return;
  }

  await importSkuGroup(skuGroupWithImages, locale as BrandsLocale, {
    preserveImages,
    preserveCategories,
    preserveImagesForCategories,
    skipPublishIfUnpublished,
    publishIfPublishedAnywhere,
    debugPublishStatus,
    reduceBurst,
  });

  const endTime = Date.now();
  medianTimeImportBySkuGroup.push(endTime - startTime);
  countImportedSkuGroups++;

  if (countImportedSkuGroups % 10 === 0) {
    console.info(
      `Imported ${countImportedSkuGroups} sku groups. Median time: ${Math.round(
        medianTimeImportBySkuGroup.reduce((a, b) => a + b, 0) /
          medianTimeImportBySkuGroup.length,
      )}ms`,
    );
  }
}

(async () => {
  const yargs = require("yargs/yargs");
  const args = yargs(rawCliArgs).argv as Record<string, unknown>;

  const ndjsonPath = String(args["ndjson-path"] ?? args.ndjsonPath ?? "").trim();
  if (!ndjsonPath) {
    throw new Error("Missing required --ndjson-path=<path>");
  }

  const localeOverrideRaw = args.locale
    ? String(args.locale).trim()
    : DEFAULT_NDJSON_LOCALE;
  const localeAvailabilityRaw =
    parseListArg(args["locale-availability"] ?? args.localeAvailability) ??
    DEFAULT_NDJSON_LOCALE_AVAILABILITY;
  const reportPath = String(
    args["report-path"] ??
      args.reportPath ??
      path.join(process.cwd(), "output/import-report.json"),
  );

  preserveImagesForCategories = parseListArg(
    args["preserve-images-for-categories"] ?? args.preserveImagesForCategories,
  )?.map((value) => value.toLowerCase());

  const localeOverride = normalizeLocale(localeOverrideRaw);
  const groups = readNdjson<DatasetSkuGroup>(ndjsonPath);
  const skuGroupTasks: SkuGroupTask[] = groups.map((group, index) => {
    const labelId = group.id ?? group.itemGroupId ?? String(index);
    return {
      label: `${localeOverrideRaw}_${labelId}.ndjson`,
      data: applyLocaleOverrides(group, localeAvailabilityRaw, localeOverrideRaw),
      localeOverride,
    };
  });

  const tasks: Promise<unknown>[] = [];
  for (const key in skuGroupTasks) {
    const task = queue.addPromise(async () => {
      try {
        await importSkuGroupFile(
          skuGroupTasks[Number(key)],
          Number(key),
          skuGroupTasks.length,
        );
      } catch (err) {
        console.warn(
          formatImportErrorMessage(
            skuGroupTasks[Number(key)].label,
            err,
            "initial",
          ),
        );
        recordImportError(skuGroupTasks[Number(key)].label, err, "initial");
        console.info(
          `Retry importing sku group from file: ${skuGroupTasks[Number(key)].label}`,
        );
        try {
          await importSkuGroupFile(
            skuGroupTasks[Number(key)],
            Number(key),
            skuGroupTasks.length,
          );
        } catch (retryError) {
          console.error(
            formatImportErrorMessage(
              skuGroupTasks[Number(key)].label,
              retryError,
              "final",
            ),
          );
          recordImportError(
            skuGroupTasks[Number(key)].label,
            retryError,
            "final",
          );
        }
      }
    });
    tasks.push(task);
  }

  await Promise.allSettled(tasks);
  console.info("All tasks completed.");
  persistSummaryReport(reportPath);
})();