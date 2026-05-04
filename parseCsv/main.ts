import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

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
  localeAvailability: string[];
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
  materialAndCare: null,
  benefits: "benefits",
};

function normalizeLocaleToken(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
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
  return normalizeLocaleToken(match[1]);
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
    const localeToken = normalizeLocaleToken(rawCsvLocale);
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

// Parser CSV simple avec gestion des guillemets et BOM.
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  while (i < content.length) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      row.push(field);
      field = "";
      if (row.some((value) => value.trim().length)) {
        rows.push(row);
      }
      row = [];
      if (char === "\r" && content[i + 1] === "\n") {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value.trim().length)) {
      rows.push(row);
    }
  }

  return rows;
}

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

// Ecriture NDJSON: 1 ligne = 1 skuGroup (pratique pour debug).
async function writeNdjson(filePath: string, groups: ParsedSkuGroup[]) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(filePath, { encoding: "utf-8" });
    stream.on("error", reject);
    stream.on("finish", resolve);
    for (const group of groups) {
      stream.write(`${JSON.stringify(group)}\n`);
    }
    stream.end();
  });
}

// Main: parse CSV -> regrouper -> dump ndjson + report json.
async function run() {
  const args = yargs(hideBin(process.argv).filter((arg) => arg !== "--"))
    .parseSync() as Record<string, unknown>;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  const defaultReportPath = path.join(currentDir, "output/parse-report.json");
  const defaultDumpPath = path.join(
    currentDir,
    "output/parsed-catalogue.ndjson",
  );

  const csvPath = resolveDefaultCsvPath(currentDir, args);
  const reportPath = String(
    args["report-path"] ?? args.reportPath ?? defaultReportPath,
  );
  const dumpPath = String(
    args["dump-path"] ?? args.dumpPath ?? defaultDumpPath,
  );
  const maxErrors = Number(args["max-errors"] ?? args.maxErrors ?? 200);

  const raw = readFileSync(csvPath, "utf-8");
  const rows = parseCsv(raw);
  if (!rows.length) {
    throw new Error("CSV file is empty.");
  }

  // Index des colonnes par nom pour acces rapide.
  const header = rows[0];
  const headerIndex = new Map<string, number>();
  header.forEach((name, index) => headerIndex.set(name.trim(), index));

  const columnMap = PORTABLE_COLUMNS;

  const physicalColumnName = (column: LogicalColumn): string | null =>
    columnMap[column];

  // Colonnes minimales pour lier SKU <-> SKU Group.
  const requiredColumns = ["item_group_id", "sku_id", "model_id"];
  for (const column of requiredColumns) {
    if (!headerIndex.has(column)) {
      throw new Error(`Missing column '${column}' in CSV header.`);
    }
  }

  const errors: ParseError[] = [];
  let totalErrors = 0;
  let rowsSkipped = 0;
  let duplicateSkuIds = 0;
  let totalSkus = 0;

  const groups = new Map<string, ParsedSkuGroup>();
  const seenSkuIds = new Set<string>();

  // Helper: recupere la valeur d'une colonne par nom.
  const getValue = (row: string[], column: LogicalColumn): string => {
    const physicalColumn = physicalColumnName(column);
    if (!physicalColumn) {
      return "";
    }
    const index = headerIndex.get(physicalColumn);
    if (index === undefined) {
      return "";
    }
    return String(row[index] ?? "");
  };

  // Helper: garde un max d'erreurs pour eviter un report trop gros.
  const pushError = (error: ParseError) => {
    totalErrors += 1;
    if (errors.length < maxErrors) {
      errors.push(error);
    }
  };

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length === 0) {
      continue;
    }

    const rowNumber = i + 1;
    const skuGroupId = getValue(row, "groupKey").trim();
    const groupId = getValue(row, "groupId").trim() || skuGroupId;
    const skuId = getValue(row, "skuId").trim();

    if (!skuGroupId) {
      rowsSkipped += 1;
      pushError({
        row: rowNumber,
        column: physicalColumnName("groupKey") ?? "groupKey",
        message: "Missing skuGroupId.",
      });
      continue;
    }

    if (!groupId) {
      rowsSkipped += 1;
      pushError({
        row: rowNumber,
        column: physicalColumnName("groupId") ?? "groupId",
        message: "Missing sku group id.",
      });
      continue;
    }

    if (!skuId) {
      rowsSkipped += 1;
      pushError({
        row: rowNumber,
        column: physicalColumnName("skuId") ?? "skuId",
        message: "Missing skuId.",
      });
      continue;
    }

    // Un skuId doit etre unique.
    if (seenSkuIds.has(skuId)) {
      rowsSkipped += 1;
      duplicateSkuIds += 1;
      pushError({
        row: rowNumber,
        column: "skuId",
        message: "Duplicate skuId encountered, row skipped.",
        value: skuId,
      });
      continue;
    }
    seenSkuIds.add(skuId);

    // Construction du SKU (locale vide, prix via fixedPricings si present).
    const title = getValue(row, "title").trim();
    if (!title) {
      pushError({
        row: rowNumber,
        column: "title",
        message: "Missing title.",
      });
    }

    const skuCode = getValue(row, "skuCode").trim();
    const itemGroupId = getValue(row, "itemGroupId").trim() || null;
    const sku: ParsedSku = {
      skuId,
      skuCode,
      title,
      description: getValue(row, "description").trim() || null,
      designedFor: getValue(row, "designedFor").trim() || null,
      sizeLabel: getValue(row, "sizeLabel").trim() || null,
      productImages: parseImages(
        getValue(row, "images"),
        rowNumber,
        title,
        errors,
      ),
      colors: parseColors(getValue(row, "colors"), rowNumber, errors),
      locale: "",
      localeAvailability: [],
      price: parsePrice(
        getValue(row, "price"),
        rowNumber,
        skuCode,
        errors,
      ),
    };

    // Creation ou recuperation du SKU Group.
    let group = groups.get(skuGroupId);
    if (!group) {
      group = {
        id: groupId,
        itemGroupId,
        varianceCode: getValue(row, "varianceCode").trim() || null,
        title: title,
        brand: parseBrand(getValue(row, "brand"), rowNumber, errors),
        catchline: getValue(row, "catchline").trim() || null,
        url: null,
        skus: [],
        functionalities: parseFunctionalities(
          getValue(row, "functionalities"),
          rowNumber,
          errors,
        ),
        materialAndCare: null,
        benefits: parseBenefits(
          getValue(row, "benefits"),
          rowNumber,
          errors,
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
      // Si le titre change pour un meme skuGroupId, on log.
      if (title && group.title && group.title !== title) {
        pushError({
          row: rowNumber,
          column: "title",
          message: `SkuGroup title mismatch for skuGroupId ${skuGroupId}.`,
          value: truncate(title),
        });
      }
      if (group.id !== groupId) {
        pushError({
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
    totalSkus += 1;
  }

  const skuGroups = Array.from(groups.values());

  // Dump NDJSON pour debug (1 ligne par skuGroup).
  await writeNdjson(dumpPath, skuGroups);

  // Report JSON avec resume + erreurs.
  mkdirSync(path.dirname(reportPath), { recursive: true });
  const report: ParseReport = {
    generatedAt: new Date().toISOString(),
    source: {
      csvPath,
      rows: rows.length - 1,
    },
    output: {
      reportPath,
      dumpPath,
    },
    summary: {
      skuGroups: skuGroups.length,
      skus: totalSkus,
      rowsSkipped,
      duplicateSkuIds,
      errors: totalErrors,
      errorsCaptured: errors.length,
      errorsTruncated: totalErrors > errors.length,
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
