# Brands Product Portable

Version autonome et copiable du script `import:brands:product`.

## Ce que cette version fait

- importe des `sku_group` et `sku` dans Contentstack
- lit uniquement un fichier NDJSON via `--ndjson-path`
- lit la configuration via `process.env`
- n'a plus de dépendances vers les packages workspace `api`, `config`, `fetcher`, `utils`, `logger`

## Installation

```bash
pnpm install
cp .env.example .env.local
```

## Commande

```bash
pnpm import:brands:product -- \
  --ndjson-path ./parseCsv/output/parsed-catalogue-fr.ndjson
```

## Commande diff seule

```bash
pnpm import:brands:product:diff -- \
  --ndjson-path ./parseCsv/output/parsed-catalogue-fr.ndjson
```

## Flags disponibles

- `--ndjson-path`
- `--report-path /path/to/import-report.json`
- `--changed-ndjson-path /path/to/changed-catalogue.ndjson`
- `--diff-report-path /path/to/diff-report.json`

## Limites volontaires

- le mode historique basé sur `extract/` n'est pas inclus
- le client Contentstack local est minimal et dédié à `sku` / `sku_group`
