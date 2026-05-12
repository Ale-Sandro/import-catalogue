import path from "node:path";

export function buildPath(
  ndjsonPath: string,
  currentPrefix: string,
  nextPrefix: string,
  extension: string,
): string {
  const baseName = path.basename(ndjsonPath, path.extname(ndjsonPath));
  const normalizedBaseName = baseName.startsWith(currentPrefix)
    ? `${nextPrefix}${baseName.slice(currentPrefix.length)}`
    : `${nextPrefix}-${baseName}`;

  return path.join(
    process.cwd(),
    "importCatalogue/expert-brands/sku-group/output",
    `${normalizedBaseName}${extension}`,
  );
}
