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
  --ndjson-path ./data/parsed-catalogue.ndjson \
  --locale en_GB \
  --locale-availability en
```

## Flags disponibles

- `--ndjson-path` obligatoire
- `--locale`
- `--locale-availability`
- `--reduce-burst`
- `--preserve-images`
- `--preserve-categories`
- `--skip-publish-if-unpublished`
- `--publish-if-published-anywhere`
- `--debug-publish-status`
- `--preserve-images-for-categories a,b,c`
- `--report-path /path/to/import-report.json`

## Limites volontaires

- le mode historique basé sur `extract/` n'est pas inclus
- le client Contentstack local est minimal et dédié à `sku` / `sku_group`