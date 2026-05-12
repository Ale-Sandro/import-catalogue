export function collectMissingTerms(
  fileName: string,
  details: unknown,
  missingTaxonomyTerms: Map<string, Set<string>>,
  missingTaxonomyByFile: Map<string, Set<string>>,
) {
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

    const rawTerms = match[1].split(",").map((term) => term.trim());
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

      const fileTerms =
        missingTaxonomyByFile.get(fileName) ?? new Set<string>();
      fileTerms.add(termUid);
      missingTaxonomyByFile.set(fileName, fileTerms);
    }
  }
}
