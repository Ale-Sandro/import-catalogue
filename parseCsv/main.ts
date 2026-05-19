import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  WriteStream,
} from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

// ============================================================================
// Types
// ============================================================================

// Types internes pour l'etape 1 (parsing uniquement).
type ParsedImage = {
  type: string;
  pixlUrl: string;
  alt: string;
};

type ParsedColor = {
  id: string;
  label: string;
  hexa: string;
};

type ParsedTextEntry = {
  title: string;
  value: string;
};

type ParsedBenefit = {
  id: string;
  label: string;
  value: string;
  picto: string;
  image?: string;
};

type ParsedSku = {
  skuId: string;
  skuCode: string;
  title: string;
  description: string | null;
  designedFor: string | null;
  sizeLabel: string | null;
  productImages: ParsedImage[] | null;
  colors: ParsedColor[] | null;
  locale: string;
  price: number | null;
};

type ParsedSkuGroup = {
  id: string;
  itemGroupId: string | null;
  varianceCode: string | null;
  title: string;
  brand: string | null;
  catchline: string | null;
  url: string | null;
  skus: ParsedSku[];
  functionalities: ParsedTextEntry[] | null;
  materialAndCare: ParsedTextEntry[] | null;
  benefits: ParsedBenefit[] | null;
  categories: string[] | null;
};

type LogicalColumn =
  | "groupKey"
  | "groupId"
  | "skuId"
  | "skuCode"
  | "title"
  | "description"
  | "designedFor"
  | "sizeLabel"
  | "images"
  | "colors"
  | "price"
  | "itemGroupId"
  | "varianceCode"
  | "brand"
  | "catchline"
  | "functionalities"
  | "materialAndCare"
  | "benefits";

// Erreurs "soft" pour continuer le parsing en cas de probleme.
type ParseError = {
  row: number;
  column?: string;
  message: string;
  value?: string;
};

// Report final pour audit/debug.
type ParseReport = {
  generatedAt: string;
  source: {
    csvPath: string;
    rows: number;
  };
  output: {
    reportPath: string;
    dumpPath: string;
  };
  summary: {
    skuGroups: number;
    skus: number;
    rowsSkipped: number;
    duplicateSkuIds: number;
    errors: number;
    errorsCaptured: number;
    errorsTruncated: boolean;
  };
  errors: ParseError[];
};

type BucketRow = {
  rowNumber: number;
  values: string[];
};

type HeaderContext = {
  logicalColumnIndexes: number[];
  physicalColumnName: (column: LogicalColumn) => string | null;
};

type ParseState = {
  outputLocale: string;
  headerContext: HeaderContext;
  pushError: (error: ParseError) => void;
  errorSink: ParseError[];
  rowsSkipped: number;
  duplicateSkuIds: number;
  totalSkus: number;
  skuGroups: number;
  seenSkuIds: Set<string>;
};

const LOGICAL_COLUMNS: LogicalColumn[] = [
  "groupKey",
  "groupId",
  "skuId",
  "skuCode",
  "title",
  "description",
  "designedFor",
  "sizeLabel",
  "images",
  "colors",
  "price",
  "itemGroupId",
  "varianceCode",
  "brand",
  "catchline",
  "functionalities",
  "materialAndCare",
  "benefits",
];

const LOGICAL_COLUMN_INDEX = Object.fromEntries(
  LOGICAL_COLUMNS.map((column, index) => [column, index]),
) as Record<LogicalColumn, number>;

const REQUIRED_COLUMNS = ["item_group_id", "sku_id", "model_id"];
const PARSE_BUCKET_COUNT = 64;

const PORTABLE_COLUMNS: Record<LogicalColumn, string | null> = {
  groupKey: "model_id",
  groupId: "model_id",
  skuId: "sku_id",
  skuCode: "sku_code",
  title: "title",
  description: "description",
  designedFor: "designed_for",
  sizeLabel: "size_label",
  images: "images",
  colors: "generic_color_details",
  price: "price",
  itemGroupId: "item_group_id",
  varianceCode: "variance_code",
  brand: "brand",
  catchline: "catchline",
  functionalities: "functionalities",
  materialAndCare: "composition",
  benefits: "benefits",
};

// ============================================================================
// CSV resolution and raw parsing
// ============================================================================

function normalizeLocaleToken(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

const PORTABLE_OUTPUT_LOCALE_ALIASES: Record<string, string> = {
  en: "en",
  "en-gb": "en",
  "en-us": "en-us",
  "en-ca": "en-ca",
  fr: "fr",
  "fr-fr": "fr",
  "fr-ca": "fr-ca",
  de: "de",
  "de-de": "de",
  es: "es-es",
  "es-es": "es-es",
  it: "it-it",
  "it-it": "it-it",
};

function normalizePortableOutputLocale(value: string): string {
  const normalized = PORTABLE_OUTPUT_LOCALE_ALIASES[normalizeLocaleToken(value)];
  if (!normalized) {
    throw new Error(
      `Unsupported locale '${value}'. Expected one of: ${Object.keys(
        PORTABLE_OUTPUT_LOCALE_ALIASES,
      ).join(", ")}`,
    );
  }

  return normalized;
}

function findPortableCsvFiles(csvDir: string): string[] {
  return readdirSync(csvDir)
    .filter((fileName) =>
      /contentstack-exporter.*\.csv$/i.test(fileName.trim()),
    )
    .sort((left, right) => left.localeCompare(right));
}

function getPortableCsvLocale(fileName: string): string | null {
  const match = fileName.trim().match(/^(.+?)_contentstack-exporter/i);
  if (!match) {
    return null;
  }

  try {
    return normalizePortableOutputLocale(match[1]);
  } catch {
    return null;
  }
}

function resolvePortableOutputLocale(
  csvPath: string,
  args: Record<string, unknown>,
): string {
  const rawCsvLocale = String(
    args["csv-locale"] ?? args.csvLocale ?? args.locale ?? "",
  ).trim();
  if (rawCsvLocale) {
    return normalizePortableOutputLocale(rawCsvLocale);
  }

  const csvFileLocale = getPortableCsvLocale(path.basename(csvPath));
  if (!csvFileLocale) {
    throw new Error(
      `Unable to infer locale from CSV '${csvPath}'. Expected a file name like 'fr-FR_contentstack-exporter.csv' or pass --csv-locale explicitly.`,
    );
  }

  return csvFileLocale;
}

function resolveDefaultCsvPath(
  currentDir: string,
  args: Record<string, unknown>,
): string {
  const explicitCsvPath = String(args["csv-path"] ?? args.csvPath ?? "").trim();
  if (explicitCsvPath) {
    return explicitCsvPath;
  }

  const csvDir = path.join(currentDir, "csv");
  const portableCsvFiles = findPortableCsvFiles(csvDir);
  if (!portableCsvFiles.length) {
    throw new Error(
      `No contentstack exporter CSV found in ${csvDir}. Use --csv-path to specify a file explicitly.`,
    );
  }

  const rawCsvLocale = String(
    args["csv-locale"] ?? args.csvLocale ?? args.locale ?? "",
  ).trim();

  if (rawCsvLocale) {
    const localeToken = normalizePortableOutputLocale(rawCsvLocale);
    const matchingFiles = portableCsvFiles.filter((fileName) =>
      getPortableCsvLocale(fileName) === localeToken,
    );

    if (!matchingFiles.length) {
      throw new Error(
        `No CSV found for locale '${rawCsvLocale}' in ${csvDir}. Available files: ${portableCsvFiles.join(", ")}`,
      );
    }

    if (matchingFiles.length > 1) {
      throw new Error(
        `Multiple CSV files found for locale '${rawCsvLocale}': ${matchingFiles.join(", ")}. Use --csv-path to disambiguate.`,
      );
    }

    return path.join(csvDir, matchingFiles[0]);
  }

  if (portableCsvFiles.length === 1) {
    return path.join(csvDir, portableCsvFiles[0]);
  }

  throw new Error(
    `Multiple contentstack exporter CSV files found in ${csvDir}: ${portableCsvFiles.join(", ")}. Use --csv-locale or --csv-path.`,
  );
}

// Tronque les valeurs dans le report pour eviter des fichiers enormes.
function truncate(value: string, maxLength = 200): string {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

// Parse le CSV en streaming pour eviter de charger tout le fichier en RAM.
async function* streamCsvRows(filePath: string): AsyncGenerator<string[]> {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let isFirstChunk = true;
  let skipNextLineFeed = false;

  const flushRow = (): string[] | null => {
    row.push(field);
    field = "";
    if (row.some((value) => value.trim().length)) {
      const completedRow = row;
      row = [];
      return completedRow;
    }
    row = [];
    return null;
  };

  for await (let chunk of stream) {
    if (isFirstChunk) {
      isFirstChunk = false;
      if (chunk.charCodeAt(0) === 0xfeff) {
        chunk = chunk.slice(1);
      }
    }

    for (let i = 0; i < chunk.length; i += 1) {
      const char = chunk[i];

      if (skipNextLineFeed) {
        skipNextLineFeed = false;
        if (char === "\n") {
          continue;
        }
      }

      if (char === '"') {
        if (inQuotes && chunk[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && char === ",") {
        row.push(field);
        field = "";
        continue;
      }

      if (!inQuotes && char === "\r") {
        const completedRow = flushRow();
        if (completedRow) {
          yield completedRow;
        }
        skipNextLineFeed = true;
        continue;
      }

      if (!inQuotes && char === "\n") {
        const completedRow = flushRow();
        if (completedRow) {
          yield completedRow;
        }
        continue;
      }

      field += char;
    }
  }

  if (field.length || row.length) {
    const completedRow = flushRow();
    if (completedRow) {
      yield completedRow;
    }
  }
}

function createErrorCollector(maxErrors: number): {
  errors: ParseError[];
  errorSink: ParseError[];
  pushError: (error: ParseError) => void;
  getTotalErrors: () => number;
} {
  const errors: ParseError[] = [];
  let totalErrors = 0;

  const pushError = (error: ParseError) => {
    totalErrors += 1;
    if (errors.length < maxErrors) {
      errors.push(error);
    }
  };

  const errorSink = new Proxy(errors, {
    get(target, property, receiver) {
      if (property === "push") {
        return (...items: ParseError[]) => {
          for (const item of items) {
            pushError(item);
          }
          return target.length;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  }) as ParseError[];

  return {
    errors,
    errorSink,
    pushError,
    getTotalErrors: () => totalErrors,
  };
}

function createHeaderContext(header: string[]): HeaderContext {
  const headerIndex = new Map<string, number>();
  header.forEach((name, index) => headerIndex.set(name.trim(), index));

  for (const column of REQUIRED_COLUMNS) {
    if (!headerIndex.has(column)) {
      throw new Error(`Missing column '${column}' in CSV header.`);
    }
  }

  return {
    logicalColumnIndexes: LOGICAL_COLUMNS.map((column) => {
      const physicalColumn = PORTABLE_COLUMNS[column];
      if (!physicalColumn) {
        return -1;
      }
      return headerIndex.get(physicalColumn) ?? -1;
    }),
    physicalColumnName: (column: LogicalColumn) => PORTABLE_COLUMNS[column],
  };
}

function extractLogicalValues(row: string[], headerContext: HeaderContext): string[] {
  return headerContext.logicalColumnIndexes.map((index) =>
    index === -1 ? "" : String(row[index] ?? ""),
  );
}

function getLogicalValue(values: string[], column: LogicalColumn): string {
  return String(values[LOGICAL_COLUMN_INDEX[column]] ?? "");
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function serializeJsonLine(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function writeLine(stream: WriteStream, line: string): Promise<void> {
  if (stream.write(line)) {
    return;
  }

  await once(stream, "drain");
}

async function closeWriteStream(stream: WriteStream): Promise<void> {
  stream.end();
  await once(stream, "finish");
}

async function bucketCsvRows(params: {
  csvPath: string;
  bucketDir: string;
}): Promise<{
  bucketPaths: string[];
  sourceRows: number;
  headerContext: HeaderContext;
}> {
  const bucketStreams = new Map<number, WriteStream>();
  const bucketPaths = new Set<string>();
  let headerContext: HeaderContext | null = null;
  let rowNumber = 0;
  let sourceRows = 0;

  try {
    for await (const row of streamCsvRows(params.csvPath)) {
      rowNumber += 1;

      if (rowNumber === 1) {
        headerContext = createHeaderContext(row);
        continue;
      }

      if (!headerContext) {
        throw new Error("CSV header could not be read.");
      }

      sourceRows += 1;
      const values = extractLogicalValues(row, headerContext);
      const groupKey = getLogicalValue(values, "groupKey").trim();
      const bucketIndex = groupKey
        ? hashString(groupKey) % PARSE_BUCKET_COUNT
        : 0;
      const bucketPath = path.join(params.bucketDir, `bucket-${bucketIndex}.jsonl`);
      let bucketStream = bucketStreams.get(bucketIndex);
      if (!bucketStream) {
        bucketStream = createWriteStream(bucketPath, { encoding: "utf-8" });
        bucketStreams.set(bucketIndex, bucketStream);
        bucketPaths.add(bucketPath);
      }

      const bucketRow: BucketRow = {
        rowNumber,
        values,
      };
      await writeLine(bucketStream, `${serializeJsonLine(bucketRow)}\n`);
    }
  } finally {
    await Promise.all(
      Array.from(bucketStreams.values()).map((stream) => closeWriteStream(stream)),
    );
  }

  if (!headerContext) {
    throw new Error("CSV file is empty.");
  }

  return {
    bucketPaths: Array.from(bucketPaths).sort((left, right) =>
      left.localeCompare(right),
    ),
    sourceRows,
    headerContext,
  };
}

async function* streamBucketRows(bucketPath: string): AsyncGenerator<BucketRow> {
  const input = createReadStream(bucketPath, { encoding: "utf-8" });
  const reader = createInterface({
    input,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  for await (const line of reader) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      yield JSON.parse(trimmed) as BucketRow;
    } catch (error) {
      throw new Error(
        `Invalid bucket JSON in ${bucketPath} at line ${lineNumber}: ${truncate(
          trimmed,
          400,
        )}`,
        { cause: error },
      );
    }
  }
}

// ============================================================================
// Generic parsing helpers
// ============================================================================

function isJsonLike(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function splitDelimitedParts(
  raw: string,
  separator: string,
  expectedParts: number,
): string[] {
  const parts: string[] = [];
  let remaining = raw;

  for (let i = 0; i < expectedParts - 1; i += 1) {
    const index = remaining.indexOf(separator);
    if (index === -1) {
      parts.push(remaining.trim());
      remaining = "";
      continue;
    }
    parts.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index + separator.length);
  }

  parts.push(remaining.trim());
  return parts;
}

function splitPipeSeparatedEntries(raw: string): string[] {
  if (!raw || !raw.trim()) {
    return [];
  }

  return raw
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// Parse JSON d'une cellule, retourne undefined si invalide.
function parseJson<T>(
  raw: string,
  row: number,
  column: string,
  errors: ParseError[],
): T | undefined {
  if (!raw || !raw.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    errors.push({
      row,
      column,
      message: "Invalid JSON",
      value: truncate(raw),
    });
    return undefined;
  }
}

// Extrait un tableau "items" d'un champ JSON.
function getItems(
  raw: string,
  row: number,
  column: string,
  errors: ParseError[],
): unknown[] {
  const parsed = parseJson<{ items?: unknown[] }>(raw, row, column, errors);
  if (!parsed) {
    return [];
  }
  if (!Array.isArray(parsed.items)) {
    errors.push({
      row,
      column,
      message: "Expected JSON object with items array.",
      value: truncate(raw),
    });
    return [];
  }
  return parsed.items;
}

// Retourne null au lieu d'un tableau vide (plus propre pour les JSON).
function normalizeArray<T>(items: T[]): T[] | null {
  return items.length ? items : null;
}

// Deduit le type d'image depuis l'extension d'URL.
function inferImageType(url: string): string {
  const cleaned = url.split("?")[0] ?? "";
  const extMatch = cleaned.match(/\\.([a-z0-9]+)$/i);
  if (!extMatch) {
    return "jpg";
  }
  return extMatch[1].toLowerCase();
}

// Genere un slug "champ-title-en-minuscule" a partir du titre.
function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Construit l'URL au format: p/<slug>/<itemGroupId>/<varianceCode>
function buildSkuGroupUrl(
  title: string,
  itemGroupId: string | null,
  varianceCode: string | null,
): string | null {
  if (!title || !itemGroupId || !varianceCode) {
    return null;
  }
  const slug = slugifyTitle(title);
  if (!slug) {
    return null;
  }
  return `p/${slug}/${itemGroupId}/${varianceCode}`;
}

// ============================================================================
// Column parsers
// ============================================================================

// Parse la colonne "images" vers productImages.
function parseImages(
  raw: string,
  row: number,
  title: string,
  errors: ParseError[],
): ParsedImage[] | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  if (!isJsonLike(raw)) {
    const images = splitPipeSeparatedEntries(raw)
      .filter((url) => /^https?:\/\//i.test(url))
      .map((url) => ({
        pixlUrl: url,
        type: inferImageType(url),
        alt: title || "picture",
      }));

    return normalizeArray(images);
  }

  const items = getItems(raw, row, "images", errors);
  const images = items
    .map((item) =>
      item && typeof item === "object" ? (item as any).entries : null,
    )
    .filter((entries) => entries && typeof entries.url === "string")
    .map((entries) => ({
      pixlUrl: String(entries.url),
      type: inferImageType(String(entries.url)),
      alt: title || "picture",
    }));

  return normalizeArray(images);
}

// Parse la colonne "colors" vers colors du SKU.
function parseColors(
  raw: string,
  row: number,
  errors: ParseError[],
): ParsedColor[] | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  if (!isJsonLike(raw)) {
    const colors = splitPipeSeparatedEntries(raw)
      .map((entry) => {
        const [id, hexa, label] = splitDelimitedParts(entry, "::", 3);
        return { id, hexa, label };
      })
      .filter((color) => color.id || color.label || color.hexa);

    return normalizeArray(colors);
  }

  const items = getItems(raw, row, "colors", errors);
  const colors = items
    .map((item) =>
      item && typeof item === "object" ? (item as any).entries : null,
    )
    .filter(Boolean)
    .map((entries) => ({
      id: String(entries.id ?? ""),
      label: String(entries.name ?? ""),
      hexa: String(entries.hexaCode ?? ""),
    }))
    .filter((color) => color.id || color.label || color.hexa);

  return normalizeArray(colors);
}

// Parse la colonne "technicalInfos" vers functionalities du SKU Group.
function parseFunctionalities(
  raw: string,
  row: number,
  errors: ParseError[],
): ParsedTextEntry[] | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  if (!isJsonLike(raw)) {
    const functionalities = splitPipeSeparatedEntries(raw)
      .map((entry) => {
        const [title, value] = splitDelimitedParts(entry, "::", 2);
        return { title, value };
      })
      .filter((entry) => entry.title || entry.value);

    return normalizeArray(functionalities);
  }

  const items = getItems(raw, row, "technicalInfos", errors);
  const functionalities = items
    .map((item) =>
      item && typeof item === "object" ? (item as any).entries : null,
    )
    .filter(Boolean)
    .map((entries) => ({
      title: String(entries.name ?? ""),
      value: String(entries.description ?? ""),
    }))
    .filter((entry) => entry.title || entry.value);

  return normalizeArray(functionalities);
}

function parseMaterialAndCare(
  raw: string,
  row: number,
  errors: ParseError[],
): ParsedTextEntry[] | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  if (!isJsonLike(raw)) {
    const entries = splitPipeSeparatedEntries(raw)
      .map((entry) => {
        const [title, value] = splitDelimitedParts(entry, ":", 2);
        return {
          title: title.trim(),
          value: value.trim(),
        };
      })
      .filter((entry) => entry.title || entry.value);

    return normalizeArray(entries);
  }

  const items = getItems(raw, row, "composition", errors);
  const entries = items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf(":");
      if (separatorIndex === -1) {
        return {
          title: item,
          value: "",
        };
      }

      return {
        title: item.slice(0, separatorIndex).trim(),
        value: item.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((entry) => entry.title || entry.value);

  return normalizeArray(entries);
}

// Parse la colonne "productAdvantages" vers benefits du SKU Group.
function parseBenefits(
  raw: string,
  row: number,
  errors: ParseError[],
): ParsedBenefit[] | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  if (!isJsonLike(raw)) {
    const benefits = splitPipeSeparatedEntries(raw)
      .map((entry) => {
        const [id, picto, image, label, value] = splitDelimitedParts(
          entry,
          "::",
          5,
        );
        return {
          id,
          picto,
          image,
          label,
          value,
        };
      })
      .filter(
        (benefit) =>
          benefit.id ||
          benefit.label ||
          benefit.value ||
          benefit.picto ||
          benefit.image,
      );

    return normalizeArray(benefits);
  }

  const items = getItems(raw, row, "productAdvantages", errors);
  const benefits = items
    .map((item) =>
      item && typeof item === "object" ? (item as any).entries : null,
    )
    .filter(Boolean)
    .map((entries) => {
      const criteriaItems = entries.criteria?.items ?? [];
      const argument = Array.isArray(criteriaItems)
        ? criteriaItems
            .map((item: any) =>
              item && typeof item === "object" ? item.entries : null,
            )
            .find((criterion: any) => criterion?.type === "ARGUMENT")
        : null;
      const value = argument?.value ?? "";
      const picto = entries.image?.entries?.id ?? "";
      return {
        id: String(entries.id ?? ""),
        label: String(entries.name ?? ""),
        value: String(value ?? ""),
        picto: String(picto ?? ""),
        image: undefined,
      };
    })
    .filter(
      (benefit) =>
        benefit.id || benefit.label || benefit.value || benefit.picto,
    );

  return normalizeArray(benefits);
}

function parsePrice(
  raw: string,
  row: number,
  skuCode: string,
  errors: ParseError[],
): number | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  if (!isJsonLike(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const items = getItems(raw, row, "fixedPricings", errors);
  if (!items.length) {
    return null;
  }

  const parseNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  };

  const findPriceValue = (entry: any): number | null => {
    const currenciesEntries = entry?.currencies?.entries;
    if (!currenciesEntries || typeof currenciesEntries !== "object") {
      return null;
    }

    const candidates: unknown[] = [];
    if ("main" in currenciesEntries) {
      candidates.push((currenciesEntries as any).main);
    }
    for (const value of Object.values(currenciesEntries)) {
      if (value !== (currenciesEntries as any).main) {
        candidates.push(value);
      }
    }

    for (const currency of candidates) {
      const informativePrices = (currency as any)?.entries?.informativePrices
        ?.items;
      if (Array.isArray(informativePrices)) {
        const initialInformativePrice = informativePrices.find(
          (item) => item?.entries?.type === "INITIAL",
        );
        const parsedInitialInformativePrice = parseNumber(
          initialInformativePrice?.entries?.value,
        );
        if (parsedInitialInformativePrice !== null) {
          return parsedInitialInformativePrice;
        }

        for (const informativePrice of informativePrices) {
          const parsedInformativePrice = parseNumber(
            informativePrice?.entries?.value,
          );
          if (parsedInformativePrice !== null) {
            return parsedInformativePrice;
          }
        }
      }

      const referenceValueWithTaxes = (currency as any)?.entries
        ?.referenceValueWithTaxes;
      const parsedReference = parseNumber(referenceValueWithTaxes);
      if (parsedReference !== null) {
        return parsedReference;
      }

      const valueWithTaxes = (currency as any)?.entries?.valueWithTaxes;
      const parsed = parseNumber(valueWithTaxes);
      if (parsed !== null) {
        return parsed;
      }
    }

    return null;
  };

  const entriesList = items
    .map((item) =>
      item && typeof item === "object" ? (item as any).entries : null,
    )
    .filter(Boolean);

  const matchedEntry = entriesList.find(
    (entry: any) => String(entry.priceId ?? "") === skuCode,
  );
  if (matchedEntry) {
    const value = findPriceValue(matchedEntry);
    if (value !== null) {
      return value;
    }
  }

  for (const entry of entriesList) {
    const value = findPriceValue(entry);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

// Parse le champ brand (JSON) pour recuperer le nom si possible.
function parseBrand(
  raw: string,
  row: number,
  errors: ParseError[],
): string | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  if (!isJsonLike(raw)) {
    return raw.trim();
  }
  const parsed = parseJson<{ entries?: { name?: string } }>(
    raw,
    row,
    "brand",
    errors,
  );
  if (parsed?.entries?.name) {
    return String(parsed.entries.name);
  }
  return raw.trim();
}

// ============================================================================
// Output writers
// ============================================================================

// Ouvre un stream NDJSON pour ecrire les skuGroups au fil de l'eau.
function createNdjsonWriteStream(filePath: string): WriteStream {
  mkdirSync(path.dirname(filePath), { recursive: true });
  return createWriteStream(filePath, { encoding: "utf-8" });
}

async function writeGroupToNdjson(
  stream: WriteStream,
  group: ParsedSkuGroup,
): Promise<void> {
  await writeLine(stream, `${serializeJsonLine(group)}\n`);
}

function processBucketRow(
  bucketRow: BucketRow,
  groups: Map<string, ParsedSkuGroup>,
  state: ParseState,
) {
  const { rowNumber, values } = bucketRow;
  const getValue = (column: LogicalColumn): string => getLogicalValue(values, column);
  const physicalColumnName = state.headerContext.physicalColumnName;
  const skuGroupId = getValue("groupKey").trim();
  const groupId = getValue("groupId").trim() || skuGroupId;
  const skuId = getValue("skuId").trim();

  if (!skuGroupId) {
    state.rowsSkipped += 1;
    state.pushError({
      row: rowNumber,
      column: physicalColumnName("groupKey") ?? "groupKey",
      message: "Missing skuGroupId.",
    });
    return;
  }

  if (!groupId) {
    state.rowsSkipped += 1;
    state.pushError({
      row: rowNumber,
      column: physicalColumnName("groupId") ?? "groupId",
      message: "Missing sku group id.",
    });
    return;
  }

  if (!skuId) {
    state.rowsSkipped += 1;
    state.pushError({
      row: rowNumber,
      column: physicalColumnName("skuId") ?? "skuId",
      message: "Missing skuId.",
    });
    return;
  }

  if (state.seenSkuIds.has(skuId)) {
    state.rowsSkipped += 1;
    state.duplicateSkuIds += 1;
    state.pushError({
      row: rowNumber,
      column: "skuId",
      message: "Duplicate skuId encountered, row skipped.",
      value: skuId,
    });
    return;
  }
  state.seenSkuIds.add(skuId);

  const title = getValue("title").trim();
  if (!title) {
    state.pushError({
      row: rowNumber,
      column: "title",
      message: "Missing title.",
    });
  }

  const skuCode = getValue("skuCode").trim();
  const itemGroupId = getValue("itemGroupId").trim() || null;
  const sku: ParsedSku = {
    skuId,
    skuCode,
    title,
    description: getValue("description").trim() || null,
    designedFor: getValue("designedFor").trim() || null,
    sizeLabel: getValue("sizeLabel").trim() || null,
    productImages: parseImages(
      getValue("images"),
      rowNumber,
      title,
      state.errorSink,
    ),
    colors: parseColors(
      getValue("colors"),
      rowNumber,
      state.errorSink,
    ),
    locale: state.outputLocale,
    price: parsePrice(
      getValue("price"),
      rowNumber,
      skuCode,
      state.errorSink,
    ),
  };

  let group = groups.get(skuGroupId);
  if (!group) {
    group = {
      id: groupId,
      itemGroupId,
      varianceCode: getValue("varianceCode").trim() || null,
      title,
      brand: parseBrand(getValue("brand"), rowNumber, state.errorSink),
      catchline: getValue("catchline").trim() || null,
      url: null,
      skus: [],
      functionalities: parseFunctionalities(
        getValue("functionalities"),
        rowNumber,
        state.errorSink,
      ),
      materialAndCare: parseMaterialAndCare(
        getValue("materialAndCare"),
        rowNumber,
        state.errorSink,
      ),
      benefits: parseBenefits(
        getValue("benefits"),
        rowNumber,
        state.errorSink,
      ),
      categories: null,
    };
    group.url = buildSkuGroupUrl(
      group.title,
      group.itemGroupId,
      group.varianceCode,
    );
    groups.set(skuGroupId, group);
  } else {
    if (title && group.title && group.title !== title) {
      state.pushError({
        row: rowNumber,
        column: "title",
        message: `SkuGroup title mismatch for skuGroupId ${skuGroupId}.`,
        value: truncate(title),
      });
    }
    if (group.id !== groupId) {
      state.pushError({
        row: rowNumber,
        column: physicalColumnName("groupId") ?? "groupId",
        message: `SkuGroup id mismatch for grouping key ${skuGroupId}.`,
        value: truncate(groupId),
      });
    }
    if (!group.url) {
      group.url = buildSkuGroupUrl(
        group.title,
        group.itemGroupId,
        group.varianceCode,
      );
    }
  }

  group.skus.push(sku);
  state.totalSkus += 1;
}

async function parseBucketsToNdjson(params: {
  bucketPaths: string[];
  dumpPath: string;
  state: ParseState;
}) {
  const dumpStream = createNdjsonWriteStream(params.dumpPath);

  try {
    for (const bucketPath of params.bucketPaths) {
      const groups = new Map<string, ParsedSkuGroup>();

      for await (const bucketRow of streamBucketRows(bucketPath)) {
        processBucketRow(bucketRow, groups, params.state);
      }

      params.state.skuGroups += groups.size;
      for (const group of groups.values()) {
        await writeGroupToNdjson(dumpStream, group);
      }
    }
  } finally {
    await closeWriteStream(dumpStream);
  }
}

// ============================================================================
// Main flow
// ============================================================================

// Main: parse CSV -> regrouper -> dump ndjson + report json.
async function run() {
  const args = yargs(hideBin(process.argv).filter((arg) => arg !== "--"))
    .parseSync() as Record<string, unknown>;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const csvPath = resolveDefaultCsvPath(currentDir, args);
  const outputLocale = resolvePortableOutputLocale(csvPath, args);

  const defaultReportPath = path.join(
    currentDir,
    `output/parse-report-${outputLocale}.json`,
  );
  const defaultDumpPath = path.join(
    currentDir,
    `output/parsed-catalogue-${outputLocale}.ndjson`,
  );
  const reportPath = String(
    args["report-path"] ?? args.reportPath ?? defaultReportPath,
  );
  const dumpPath = String(
    args["dump-path"] ?? args.dumpPath ?? defaultDumpPath,
  );
  const maxErrors = Number(args["max-errors"] ?? args.maxErrors ?? 200);
  mkdirSync(path.join(currentDir, "output"), { recursive: true });
  const bucketsDir = mkdtempSync(
    path.join(currentDir, "output/parse-buckets-"),
  );

  const {
    errors,
    errorSink,
    pushError,
    getTotalErrors,
  } = createErrorCollector(maxErrors);

  let sourceRows = 0;
  let parseState: ParseState | null = null;

  try {
    const bucketed = await bucketCsvRows({
      csvPath,
      bucketDir: bucketsDir,
    });
    sourceRows = bucketed.sourceRows;

    parseState = {
      outputLocale,
      headerContext: bucketed.headerContext,
      pushError,
      errorSink,
      rowsSkipped: 0,
      duplicateSkuIds: 0,
      totalSkus: 0,
      skuGroups: 0,
      seenSkuIds: new Set<string>(),
    };

    await parseBucketsToNdjson({
      bucketPaths: bucketed.bucketPaths,
      dumpPath,
      state: parseState,
    });
  } finally {
    rmSync(bucketsDir, { recursive: true, force: true });
  }

  if (!parseState) {
    throw new Error("Parse state was not initialized.");
  }

  // Report JSON avec resume + erreurs.
  mkdirSync(path.dirname(reportPath), { recursive: true });
  const report: ParseReport = {
    generatedAt: new Date().toISOString(),
    source: {
      csvPath,
      rows: sourceRows,
    },
    output: {
      reportPath,
      dumpPath,
    },
    summary: {
      skuGroups: parseState.skuGroups,
      skus: parseState.totalSkus,
      rowsSkipped: parseState.rowsSkipped,
      duplicateSkuIds: parseState.duplicateSkuIds,
      errors: getTotalErrors(),
      errorsCaptured: errors.length,
      errorsTruncated: getTotalErrors() > errors.length,
    },
    errors,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.info("[importCatalogue] parse summary", report.summary);
  console.info("[importCatalogue] report saved", reportPath);
  console.info("[importCatalogue] dump saved", dumpPath);
}

// Execution avec message clair en cas d'echec.
run().catch((error) => {
  console.error("[importCatalogue] parse failed", error);
  process.exitCode = 1;
});
