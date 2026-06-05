# Expert Brands Catalogue Import

Standalone Node.js/TypeScript tooling to download, parse, diff, and import the Expert Brands catalogue into Contentstack.

The repository contains everything needed for this workflow: the CSV parser, a minimal Contentstack Management API client, diff/report generation, brand-specific rules, and the import logic for `sku` and `sku_group` entries.

## Table of contents

- [Workflow overview](#workflow-overview)
- [Installation](#installation)
- [Contentstack configuration](#contentstack-configuration)
- [Available commands](#available-commands)
- [Command options](#command-options)
- [Inputs and outputs](#inputs-and-outputs)
- [Business rules](#business-rules)
- [Repository structure](#repository-structure)
- [Troubleshooting](#troubleshooting)

## Workflow overview

The complete workflow has 4 steps:

1. Download the remote catalogue CSV from the XMerch Contentstack exporter URL.
2. Parse the CSV into NDJSON, with 1 line per `sku_group` containing its `sku` list.
3. Diff the current NDJSON against the local `latest` snapshot to detect created, updated, unchanged, and removed groups.
4. Import only the required changes into Contentstack and update the `latest` snapshot when the import has no recorded errors.

```text
Remote or local CSV
  -> parseCsv/output/parsed-catalogue-<locale>.ndjson
  -> importCatalogue/expert-brands/sku-group/output/changed-catalogue-<locale>.ndjson
  -> Contentstack sku + sku_group
  -> importCatalogue/expert-brands/fixtures/latest-<locale>.ndjson
```

You can run each step separately, download and parse only, or run the full sync in one command.

## Installation

Requirements:

- Node.js with native `fetch` support.
- `pnpm`.

```bash
pnpm install
cp .env.example .env.local
```

All scripts run with `tsx`. When using `pnpm`, pass script options after `--`.

## Contentstack configuration

Contentstack variables are required only for commands that import into Contentstack: `import:brands:product` and `sync:brands:product`.

The import command loads `.env.local` automatically.

| Variable                            | Required | Description                                                                          |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `CONTENTSTACK_API_MANAGEMENT_HOST`  | Yes      | Contentstack Management API host. Example: `https://gcp-na-api.contentstack.com/v3`. |
| `CONTENTSTACK_API_MANAGEMENT_TOKEN` | Yes      | Contentstack Management Token.                                                       |
| `CONTENTSTACK_API_KEY`              | Yes      | Contentstack stack API key.                                                          |
| `CONTENTSTACK_BRANCH`               | Yes      | Target Contentstack branch.                                                          |
| `EXPERT_BRANDS_PUBLISH_ENVS`        | No       | Comma-separated list of publish environments. Defaults to `staging`.                 |

## Available commands

### 1. Download CSV and parse only

Use this command when you want to parse the catalogue directly from the remote CSV URL, without running the diff and without importing anything into Contentstack.

```bash
pnpm sync:brands:catalogue:parse -- --locale fr
```

What it does:

- resolves the remote CSV URL from `--locale`;
- downloads the CSV into `parseCsv/csv/<sourceLocale>_contentstack-exporter.csv`;
- runs the local parser with generated paths;
- writes the parsed NDJSON and parse report into `parseCsv/output`.

Generated files for `--locale fr`:

- `parseCsv/csv/fr-FR_contentstack-exporter.csv`
- `parseCsv/output/parsed-catalogue-fr.ndjson`
- `parseCsv/output/parse-report-fr.json`

This command does not require `.env.local` because it does not call Contentstack Management APIs.

### 2. Full download, parse, diff, and import sync

Use this command to run the full workflow for one locale.

```bash
pnpm sync:brands:product -- --locale fr
```

What it does:

- downloads the remote CSV;
- parses the CSV into NDJSON;
- diffs the parsed catalogue against the local `latest` snapshot;
- imports created and updated `sku_group` and `sku` entries into Contentstack;
- processes removed groups as unpublished entries tagged `removed`;
- updates the local `latest` snapshot only if the import finishes without recorded errors.

Generated files for `--locale fr`:

- `parseCsv/csv/fr-FR_contentstack-exporter.csv`
- `parseCsv/output/parsed-catalogue-fr.ndjson`
- `parseCsv/output/parse-report-fr.json`
- `importCatalogue/expert-brands/sku-group/output/changed-catalogue-fr.ndjson`
- `importCatalogue/expert-brands/sku-group/output/diff-report-fr.json`
- `importCatalogue/expert-brands/sku-group/output/import-report-fr.json`

### 3. Parse a local CSV only

Use this command when you already have a local exporter CSV and want to transform it into the NDJSON format used by the import.

```bash
pnpm import:brands:catalogue:parse -- \
  --csv-path ./parseCsv/csv/fr-FR_contentstack-exporter.csv \
  --csv-locale fr \
  --dump-path ./parseCsv/output/parsed-catalogue-fr.ndjson \
  --report-path ./parseCsv/output/parse-report-fr.json
```

If `--csv-path` is omitted, the parser tries to find a `*contentstack-exporter*.csv` file in `parseCsv/csv`.

### 4. Diff only

Use this command to compare a parsed NDJSON file with the local `latest` snapshot, without calling Contentstack.

```bash
pnpm import:brands:product:diff -- \
  --ndjson-path ./parseCsv/output/parsed-catalogue-fr.ndjson
```

This command writes:

- an NDJSON file containing only created or updated `sku_group` entries;
- a JSON diff report with `created`, `updated`, `unchanged`, and `removed` statuses.

It does not update the `latest` snapshot.

### 5. Import into Contentstack

Use this command to diff a parsed NDJSON file and import the required changes into Contentstack.

```bash
pnpm import:brands:product -- \
  --ndjson-path ./parseCsv/output/parsed-catalogue-fr.ndjson
```

What it does:

- creates or updates `sku` entries;
- creates or updates `sku_group` entries;
- publishes entries to `EXPERT_BRANDS_PUBLISH_ENVS`, unless they must stay unpublished;
- tags removed groups as `removed` and keeps them unpublished;
- updates `importCatalogue/expert-brands/fixtures/latest-<locale>.ndjson` only if no import error was recorded.

## Command options

### `sync:brands:catalogue:parse`

| Option     | Required | Default | Description                                                                                                                                 |
| ---------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--locale` | Yes      | None    | Locale to download and parse. It determines the remote CSV URL, source locale, output locale, CSV path, NDJSON path, and parse report path. |

Supported locales:

- `fr`, `fr-fr`, `fr-ca`
- `en`, `en-gb`, `en-us`, `en-ca`
- `de`, `de-de`
- `es-es`
- `it-it`

### `sync:brands:product`

| Option     | Required | Default | Description                                                                                                                              |
| ---------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `--locale` | Yes      | None    | Locale to fully synchronize. It determines the remote CSV URL, output locale, generated parse paths, diff paths, and import report path. |

Supported locales:

- `fr`, `fr-fr`, `fr-ca`
- `en`, `en-gb`, `en-us`, `en-ca`
- `de`, `de-de`
- `es-es`
- `it-it`

### Locale mapping for sync commands

| Input locale  | Remote CSV source locale | Output locale |
| ------------- | ------------------------ | ------------- |
| `fr`, `fr-fr` | `fr-FR`                  | `fr`          |
| `fr-ca`       | `fr-CA`                  | `fr-ca`       |
| `en`, `en-gb` | `en-GB`                  | `en`          |
| `en-us`       | `en-US`                  | `en-us`       |
| `en-ca`       | `en-CA`                  | `en-ca`       |
| `de`, `de-de` | `de-DE`                  | `de`          |
| `es-es`       | `es-ES`                  | `es-es`       |
| `it-it`       | `it-IT`                  | `it-it`       |

The remote CSV URL is built from this base URL:

```text
https://xmerch-syndication-export.x-merch-common.decathlon.net/contentstack
```

Example for `--locale fr`:

```text
https://xmerch-syndication-export.x-merch-common.decathlon.net/contentstack/fr-FR_contentstack-exporter.csv
```

### `import:brands:catalogue:parse`

| Option          | Required | Default                                            | Description                                                                                                                     |
| --------------- | -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--csv-path`    | No       | Auto-detected in `parseCsv/csv`                    | Path to the exporter CSV to parse.                                                                                              |
| `--csv-locale`  | No       | Inferred from the CSV file name                    | Output locale. `--locale` is also accepted as an alias.                                                                         |
| `--dump-path`   | No       | `parseCsv/output/parsed-catalogue-<locale>.ndjson` | Generated NDJSON path. CamelCase alias: `--dumpPath`.                                                                           |
| `--report-path` | No       | `parseCsv/output/parse-report-<locale>.json`       | Parse report path. CamelCase alias: `--reportPath`.                                                                             |
| `--max-errors`  | No       | `200`                                              | Maximum number of detailed errors kept in the report. The total error counter remains complete. CamelCase alias: `--maxErrors`. |

Parser-supported locale inputs:

- `en`, `en-gb`, `en-us`, `en-ca`
- `fr`, `fr-fr`, `fr-ca`
- `de`, `de-de`
- `es`, `es-es`
- `it`, `it-it`

Important parser locale normalizations:

- `fr-fr` becomes `fr`;
- `en-gb` becomes `en`;
- `de-de` becomes `de`;
- `es` becomes `es-es`;
- `it` becomes `it-it`.

### `import:brands:product:diff`

| Option                  | Required | Default                                                                             | Description                                                                               |
| ----------------------- | -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--ndjson-path`         | No       | Auto-detected in `parseCsv/output` if exactly one `parsed-catalogue*.ndjson` exists | Current NDJSON file to compare. CamelCase alias: `--ndjsonPath`.                          |
| `--latest-path`         | No       | `importCatalogue/expert-brands/fixtures/latest-<locale>.ndjson`                     | Reference snapshot. CamelCase alias: `--latestPath`.                                      |
| `--changed-ndjson-path` | No       | `importCatalogue/expert-brands/sku-group/output/changed-catalogue-<locale>.ndjson`  | NDJSON file containing created or updated groups. CamelCase alias: `--changedNdjsonPath`. |
| `--diff-report-path`    | No       | `importCatalogue/expert-brands/sku-group/output/diff-report-<locale>.json`          | Diff report path. CamelCase alias: `--diffReportPath`.                                    |

The locale is inferred from the NDJSON file name. Expected example: `parsed-catalogue-fr.ndjson`.

### `import:brands:product`

| Option                  | Required | Default                                                                             | Description                                                                               |
| ----------------------- | -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--ndjson-path`         | No       | Auto-detected in `parseCsv/output` if exactly one `parsed-catalogue*.ndjson` exists | Current NDJSON file to import. CamelCase alias: `--ndjsonPath`.                           |
| `--latest-path`         | No       | `importCatalogue/expert-brands/fixtures/latest-<locale>.ndjson`                     | Reference snapshot for the diff. CamelCase alias: `--latestPath`.                         |
| `--changed-ndjson-path` | No       | `importCatalogue/expert-brands/sku-group/output/changed-catalogue-<locale>.ndjson`  | NDJSON file containing created or updated groups. CamelCase alias: `--changedNdjsonPath`. |
| `--diff-report-path`    | No       | `importCatalogue/expert-brands/sku-group/output/diff-report-<locale>.json`          | Diff report path. CamelCase alias: `--diffReportPath`.                                    |
| `--report-path`         | No       | `importCatalogue/expert-brands/sku-group/output/import-report-<locale>.json`        | Final import report path. CamelCase alias: `--reportPath`.                                |

Contentstack import locales supported by the import code: `en`, `en-us`, `en-ca`, `fr`, `fr-ca`, `de`, `es-es`, `it-it`.

## Inputs and outputs

### Expected CSV columns

Required columns:

- `item_group_id`
- `sku_id`
- `model_id`

Optional columns used by the parser:

- `model_id`: grouping identifier and `sku_group.model_id`.
- `sku_id`: functional SKU identifier.
- `sku_code`: SKU code, also used to find the matching price in JSON pricing data.
- `title`: `sku` and `sku_group` title.
- `description`: SKU description.
- `designed_for`: SKU `designed_for` field.
- `size_label`: SKU size label.
- `images`: product images. Accepts exporter JSON or HTTP URLs separated by pipes.
- `generic_color_details`: colors. Accepts exporter JSON or pipe-separated `id::hexa::label` entries.
- `price`: price. Accepts a plain number or exporter JSON.
- `is_out_of_stock`: `true` or `false`. Out-of-stock SKUs are kept unpublished.
- `item_group_id`: `sku_group.item_group_id`.
- `product_nature_id`: used by brand-specific rules.
- `variance_code`: used for the `sku_group` and generated URL.
- `brand`: brand taxonomy term. Accepts plain text or exporter JSON.
- `catchline`: catchline propagated to SKUs.
- `functionalities`: accepts exporter JSON or pipe-separated `title::value` entries.
- `composition`: materials and care. Accepts exporter JSON or pipe-separated `title:value` entries.
- `benefits`: accepts exporter JSON or pipe-separated `id::picto::image::label::value` entries.
- `brand_tags`: categories converted to `category` taxonomy terms.

### Generated NDJSON

Each NDJSON line represents one `sku_group` with its `sku` list.

Main fields:

- `id`, `itemGroupId`, `productNatureId`, `varianceCode`, `title`, `brand`, `catchline`, `url`;
- `categories`, `functionalities`, `materialAndCare`, `benefits`;
- `skus[]` with `skuId`, `skuCode`, `title`, `description`, `designedFor`, `sizeLabel`, `productImages`, `colors`, `locale`, `price`, and `isOutOfStock`.

### Reports and history

Generated JSON reports include the generation date, source paths, output paths, and a summary.

- Parse reports include captured errors and skipped rows.
- Diff reports include one entry per `sku_group` with its status.
- Import reports include import errors and detected missing taxonomy terms.

Every generated artifact handled by the scripts is also copied into a sibling `history` folder with a timestamped file name.

Runtime CSV files and generated outputs are ignored by git.

## Business rules

### Diff and `latest` snapshot

- The diff compares the current groups with `latest-<locale>.ndjson` using stable serialization.
- Possible statuses are `created`, `updated`, `unchanged`, and `removed`.
- Only `created` and `updated` groups are imported normally.
- `removed` groups are looked up in Contentstack, tagged `removed`, and kept unpublished.
- The `latest` snapshot is rewritten only after an import without recorded errors.

### Publication and unpublication

A `sku_group` is created or updated but kept unpublished when:

- at least one SKU in the group has no image;
- no SKU in the group has a price;
- the existing Contentstack entry already has the `unpublished` tag;
- the group is processed as removed.

A `sku` is kept unpublished when:

- its `isOutOfStock` value is `true`;
- its parent group must stay unpublished.

When an entry must stay unpublished, the script unpublishes already-published `staging` and `prod_*` environments if needed.

### Brand-specific rules

- Brand names are normalized as taxonomy term UIDs: lowercase, accent-free, and separated with underscores.
- Brand-specific handlers currently exist for `kiprun`, `simond`, and `van_rysel`.
- `van_rysel` excludes a configured list of `item_group_id` values.
- `kiprun` and `simond` also support exclusion lists; they are currently empty.
- For `simond` in locale `en`, some `product_nature_id` values add the `age_restricted` tag.

## Repository structure

```text
parseCsv/
  main.ts                         Local CSV -> NDJSON parser and parse report

syncCatalogue/
  parse.ts                        Download remote CSV -> parse only
  main.ts                         Download -> parse -> diff -> import orchestration
  getLocaleConfig.ts              Locale -> remote CSV URL and generated paths
  downloadCsv.ts                  CSV downloader
  runScript.ts                    Sub-process script runner

importCatalogue/contentstack/
  api.ts                          Minimal Contentstack Management API client
  types.ts                        Contentstack API types

importCatalogue/expert-brands/
  config.ts                       Publish environment configuration
  dataset.types.ts                Expected NDJSON schema
  contentstack.types.ts           Contentstack entry schema
  sku/                            SKU import logic
  sku-group/                      Diff, SKU group import, reports, and brand rules
  fixtures/                       latest snapshots by locale
```

## Troubleshooting

### `Missing --locale. Example: --locale fr`

Pass `--locale` to `sync:brands:catalogue:parse` or `sync:brands:product`.

### `Unsupported locale ...`

The locale is not supported by the selected command. Check the supported locale list in this README.

### `Failed to download CSV ...`

The remote CSV URL could not be downloaded. Check network access and confirm that the generated source locale exists in the exporter bucket.

### `Missing required environment variable ...`

Create `.env.local` and fill the required Contentstack variables before running an import command.

### `No contentstack exporter CSV found ...`

Put a CSV file in `parseCsv/csv` or pass `--csv-path` explicitly to `import:brands:catalogue:parse`.

### `Multiple contentstack exporter CSV files found ...`

Pass `--csv-locale` or `--csv-path` to remove the ambiguity.

### `No parsed catalogue NDJSON found ...`

Run a parse command first or pass `--ndjson-path` explicitly.

### `Unable to infer locale from ...`

The NDJSON file name must end with a recognized locale, for example `parsed-catalogue-fr.ndjson`.

### `latest snapshot not updated because import errors were recorded`

The `latest-<locale>.ndjson` file is not updated when the import report contains errors. Fix the errors from the import report, then run the import again.
