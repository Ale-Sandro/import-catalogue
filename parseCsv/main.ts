import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

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
  functionalities: { title: string; value: string }[] | null;
  materialAndCare: { title: string; value: string }[] | null;
  benefits:
    | { id: string; label: string; value: string; picto: string }[]
    | null;
  categories: string[] | null;
};

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

const ITEM_GROUP_CATEGORY_MAP: Record<string, string[]> = {
  "338987": ["kr_accessories", "kr_accessories_belts_bags"],
  "312087": ["kr_accessories", "kr_accessories_belts_bags"],
  "343432": ["kr_accessories", "kr_accessories_belts_bags"],
  "338986": ["kr_accessories", "kr_accessories_belts_bags"],
  "362245": ["shoes", "shoes_road_running", "shoes_road_running_men"],
  "362113": ["shoes", "shoes_road_running", "shoes_road_running_men"],
  "369831": ["shoes", "shoes_road_running", "shoes_road_running_men"],
  "362206": ["shoes", "shoes_trail_running", "shoes_trail_running_men"],
  "362185": ["shoes", "shoes_road_running", "shoes_road_running_men"],
  "380020": ["shoes", "shoes_road_running", "shoes_road_running_men"],
  "362176": ["shoes", "shoes_road_running", "shoes_road_running_women"],
  "379947": ["shoes", "shoes_road_running", "shoes_road_running_women"],
  "361994": ["shoes", "shoes_trail_running", "shoes_trail_running_men"],
  "361989": ["shoes", "shoes_trail_running", "shoes_trail_running_women"],
  "361996": ["shoes", "shoes_trail_running", "shoes_trail_running_women"],
  "362221": ["shoes", "shoes_road_running", "shoes_road_running_women"],
  "361899": ["shoes", "shoes_trail_running", "shoes_trail_running_women"],
  "362244": ["shoes", "shoes_road_running", "shoes_road_running_men"],
  "362234": ["shoes", "shoes_trail_running", "shoes_trail_running_women"],
  "344027": ["kr_accessories", "kr_accessories_caps_gloves"],
  "344527": ["kr_accessories", "kr_accessories_belts_bags"],
  "312059": ["kr_accessories", "kr_accessories_caps_gloves"],
  "352164": ["kr_accessories", "kr_accessories_caps_gloves"],
  "168331": ["kr_accessories", "kr_accessories_caps_gloves"],
  "310832": ["kr_accessories", "kr_accessories_caps_gloves"],
  "352243": ["kr_accessories", "kr_accessories_belts_bags"],
  "348159": ["kr_accessories", "kr_accessories_socks"],
  "348137": ["kr_accessories", "kr_accessories_socks"],
  "348089": ["kr_accessories", "kr_accessories_socks"],
  "348201": ["kr_accessories", "kr_accessories_socks"],
  "301979": ["kr_accessories", "kr_accessories_belts_bags"],
  "329994": ["kr_accessories", "kr_accessories_belts_bags"],
  "11690": ["kr_accessories", "kr_accessories_socks"],
  "152557": ["clothing", "clothing_women"],
  "157211": ["kr_accessories", "kr_accessories_caps_gloves"],
  "307953": ["kr_accessories", "kr_accessories_belts_bags"],
  "325793": ["kr_accessories", "kr_accessories_socks"],
  "325924": ["kr_accessories", "kr_accessories_belts_bags"],
  "330829": ["kr_accessories", "kr_accessories_belts_bags"],
  "333176": ["kr_accessories", "kr_accessories_belts_bags"],
  "333374": ["clothing", "clothing_men"],
  "334226": ["kr_accessories", "kr_accessories_belts_bags"],
  "339765": ["clothing", "clothing_men"],
  "340009": ["clothing", "clothing_women"],
  "340033": ["clothing", "clothing_women"],
  "340758": ["kr_accessories", "kr_accessories_caps_gloves"],
  "340804": ["kr_accessories", "kr_accessories_caps_gloves"],
  "340992": ["clothing", "clothing_men"],
  "341015": ["clothing", "clothing_women"],
  "344411": ["clothing", "clothing_women"],
  "346523": ["clothing", "clothing_women"],
  "346564": ["clothing", "clothing_women"],
  "350661": ["clothing", "clothing_men"],
  "351243": ["clothing", "clothing_women"],
  "352661": ["kr_accessories", "kr_accessories_caps_gloves"],
  "352765": ["clothing", "clothing_men"],
  "357727": ["clothing", "clothing_men"],
};

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
): { title: string; value: string }[] | null {
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
): { title: string; value: string }[] | null {
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
): { id: string; label: string; value: string; picto: string }[] | null {
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
      };
    })
    .filter(
      (benefit) =>
        benefit.id || benefit.label || benefit.value || benefit.picto,
    );

  return normalizeArray(benefits);
}

function parseProductNatureCategory(
  raw: string,
  rawCommercial: string,
  row: number,
  errors: ParseError[],
): string | null {
  const parsed = parseJson<{ entries?: { name?: string } }>(
    raw,
    row,
    "productNatureGroupLevel1",
    errors,
  );
  const name = parsed?.entries?.name;
  if (!name || !String(name).trim()) {
    return null;
  }

  const groupKey = String(name).trim().toLowerCase();
  if (groupKey === "apparel") {
    const commercial = parseJson<{ entries?: { name?: string } }>(
      rawCommercial,
      row,
      "commercialProductNature",
      errors,
    );
    const commercialName = commercial?.entries?.name;
    if (
      commercialName &&
      String(commercialName).trim().toLowerCase() === "shoes"
    ) {
      return "shoes";
    }
    return "clothing";
  }

  if (groupKey === "bags, luggages and boxes" || groupKey === "nutrition") {
    return "kr_accessories";
  }

  errors.push({
    row,
    column: "productNatureGroupLevel1",
    message: "Unsupported productNatureGroupLevel1 name.",
    value: truncate(String(name)),
  });
  return groupKey;
}

function mergeCategory(
  existing: string[] | null,
  category: string | null,
): string[] | null {
  if (!category) {
    return existing;
  }
  const merged = new Set<string>(existing ?? []);
  merged.add(category);
  return Array.from(merged.values());
}

function getMappedCategories(itemGroupId: string | null): string[] | null {
  if (!itemGroupId) {
    return null;
  }

  const mapped = ITEM_GROUP_CATEGORY_MAP[itemGroupId];
  if (!mapped?.length) {
    return null;
  }

  return mapped.filter(Boolean);
}

function parseFixedPricingsPrice(
  raw: string,
  row: number,
  skuCode: string,
  errors: ParseError[],
): number | null {
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const args = require("yargs").argv as Record<string, unknown>;

  const defaultCsvPath = path.join(__dirname, "catalogue/export-catalogue.csv");
  const defaultReportPath = path.join(__dirname, "output/parse-report.json");
  const defaultDumpPath = path.join(
    __dirname,
    "output/parsed-catalogue.ndjson",
  );

  const csvPath = String(args["csv-path"] ?? args.csvPath ?? defaultCsvPath);
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

  // Colonnes minimales pour lier SKU <-> SKU Group.
  const requiredColumns = ["skuGroupId", "skuId"];
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
  const getValue = (row: string[], column: string): string => {
    const index = headerIndex.get(column);
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
    const skuGroupId = getValue(row, "skuGroupId").trim();
    const skuId = getValue(row, "skuId").trim();

    if (!skuGroupId) {
      rowsSkipped += 1;
      pushError({
        row: rowNumber,
        column: "skuGroupId",
        message: "Missing skuGroupId.",
      });
      continue;
    }

    if (!skuId) {
      rowsSkipped += 1;
      pushError({
        row: rowNumber,
        column: "skuId",
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
    const mappedCategories = getMappedCategories(itemGroupId);
    const category = mappedCategories
      ? null
      : parseProductNatureCategory(
          getValue(row, "productNatureGroupLevel1"),
          getValue(row, "commercialProductNature"),
          rowNumber,
          errors,
        );
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
      price: parseFixedPricingsPrice(
        getValue(row, "fixedPricings"),
        rowNumber,
        skuCode,
        errors,
      ),
    };

    // Creation ou recuperation du SKU Group.
    let group = groups.get(skuGroupId);
    if (!group) {
      group = {
        id: skuGroupId,
        itemGroupId,
        varianceCode: getValue(row, "varianceCode").trim() || null,
        title: title,
        brand: parseBrand(getValue(row, "brand"), rowNumber, errors),
        catchline: getValue(row, "catchline").trim() || null,
        url: null,
        skus: [],
        functionalities: parseFunctionalities(
          getValue(row, "technicalInfos"),
          rowNumber,
          errors,
        ),
        materialAndCare: parseMaterialAndCare(
          getValue(row, "composition"),
          rowNumber,
          errors,
        ),
        benefits: parseBenefits(
          getValue(row, "productAdvantages"),
          rowNumber,
          errors,
        ),
        categories: mappedCategories ?? mergeCategory(null, category),
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
      if (!group.url) {
        group.url = buildSkuGroupUrl(
          group.title,
          group.itemGroupId,
          group.varianceCode,
        );
      }
      if (!group.materialAndCare?.length) {
        group.materialAndCare = parseMaterialAndCare(
          getValue(row, "composition"),
          rowNumber,
          errors,
        );
      }
      group.categories =
        mappedCategories ?? mergeCategory(group.categories, category);
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
