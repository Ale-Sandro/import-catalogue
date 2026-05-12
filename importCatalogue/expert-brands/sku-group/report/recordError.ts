import { collectMissingTerms } from "./collectMissingTerms.js";
import { formatError } from "./formatError.js";

export function recordError(params: {
  fileName: string;
  err: unknown;
  phase: "initial" | "final";
  importErrors: Array<{
    file: string;
    phase: "initial" | "final";
    message: string;
  }>;
  missingTaxonomyTerms: Map<string, Set<string>>;
  missingTaxonomyByFile: Map<string, Set<string>>;
}) {
  if (!params.err || typeof params.err !== "object") {
    params.importErrors.push({
      file: params.fileName,
      phase: params.phase,
      message: `${params.phase} error: ${String(params.err)}`,
    });
    return;
  }

  const errorObj = params.err as {
    details?: unknown;
  };

  collectMissingTerms(
    params.fileName,
    errorObj.details,
    params.missingTaxonomyTerms,
    params.missingTaxonomyByFile,
  );

  params.importErrors.push({
    file: params.fileName,
    phase: params.phase,
    message: formatError(params.fileName, params.err, params.phase),
  });
}
