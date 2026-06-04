import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function saveReport(params: {
  reportPath: string;
  importErrors: Array<{
    file: string;
    phase: "initial" | "final";
    message: string;
  }>;
  missingTaxonomyTerms: Map<string, Set<string>>;
  missingTaxonomyByFile: Map<string, Set<string>>;
  summary?: Record<string, unknown>;
}) {
  mkdirSync(path.dirname(params.reportPath), { recursive: true });

  const errorsPayload = params.importErrors.map((error) => ({
    file: error.file,
    phase: error.phase,
    message: error.message,
    missingTaxonomyTerms: Array.from(
      (params.missingTaxonomyByFile.get(error.file) ?? new Set<string>()).values(),
    ).sort(),
  }));

  const missingTaxonomiesPayload = Array.from(
    params.missingTaxonomyTerms.entries(),
  ).map(([taxonomy, terms]) => ({
    taxonomy,
    terms: Array.from(terms.values()).sort(),
  }));

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    summary: params.summary ?? {},
    errors: errorsPayload,
    missingTaxonomies: missingTaxonomiesPayload,
  };

  writeFileSync(
    params.reportPath,
    JSON.stringify(reportPayload, null, 2),
    "utf-8",
  );
  console.info(`Import report saved to ${params.reportPath}`);

  return reportPayload;
}
