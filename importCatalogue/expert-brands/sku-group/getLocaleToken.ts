import path from "node:path";

export function getLocaleToken(ndjsonPath: string): string {
  const baseName = path.basename(ndjsonPath, path.extname(ndjsonPath));
  const match = baseName.match(/(?:^|[-_])([a-z]{2}(?:[-_][a-z]{2})?)$/i);
  if (!match) {
    throw new Error(
      `Unable to infer locale from '${ndjsonPath}'. Expected an NDJSON file name like 'parsed-catalogue-fr.ndjson'.`,
    );
  }

  return match[1].replace(/_/g, "-");
}
