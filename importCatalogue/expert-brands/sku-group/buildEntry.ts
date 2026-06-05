import { EntryInput } from "../../contentstack/types.js";
import { DatasetSkuGroup } from "../dataset.types.js";
import { buildBrandTerm } from "../brandTerm.js";
import { normalizeLocaleAvailability, SkuGroupInput, BrandsLocale } from "../types.js";
import { importSku } from "../sku/import.js";
import { sleep } from "../shared/sleep.js";
import { normalizeCategory } from "./normalizeCategory.js";
import { buildTags } from "./buildTags.js";
import { ImportSkuGroupOptions } from "./options.js";

const REDUCE_BURST_DELAY_MS = 300;

export async function buildEntry(
  skuGroup: DatasetSkuGroup,
  locale: BrandsLocale,
  options?: ImportSkuGroupOptions,
): Promise<EntryInput<SkuGroupInput>> {
  const importSkuWithRetry = async (sku: DatasetSkuGroup["skus"][number]) => {
    try {
      return await importSku(sku, skuGroup, locale, {
        keepUnpublished: options?.keepUnpublished,
        keepUnpublishedReason: options?.keepUnpublishedReason,
        requireExisting: options?.requireExisting,
      });
    } catch {
      console.info(`Retry import SKU ${sku.skuId} for SKU Group ${skuGroup.id}`);
      return importSku(sku, skuGroup, locale, {
        keepUnpublished: options?.keepUnpublished,
        keepUnpublishedReason: options?.keepUnpublishedReason,
        requireExisting: options?.requireExisting,
      });
    }
  };

  type SavedSku = NonNullable<Awaited<ReturnType<typeof importSkuWithRetry>>>;

  const savedSkuRecords: {
    sourceSku: DatasetSkuGroup["skus"][number];
    savedSku: SavedSku;
  }[] = [];
  if (options?.reduceBurst) {
    for (let index = 0; index < skuGroup.skus.length; index += 1) {
      const sku = skuGroup.skus[index];
      const savedSku = await importSkuWithRetry(sku);
      if (savedSku) {
        savedSkuRecords.push({
          sourceSku: sku,
          savedSku,
        });
      }
      if (index < skuGroup.skus.length - 1) {
        await sleep(REDUCE_BURST_DELAY_MS);
      }
    }
  } else {
    const settledSkuRecords = await Promise.all(
      skuGroup.skus.map(async (sku) => ({
        sourceSku: sku,
        savedSku: await importSkuWithRetry(sku),
      })),
    );
    savedSkuRecords.push(
      ...settledSkuRecords.filter(
        (
          record,
        ): record is {
          sourceSku: DatasetSkuGroup["skus"][number];
          savedSku: SavedSku;
        } => record.savedSku !== null,
      ),
    );
  }

  if (!savedSkuRecords.length) {
    throw new Error(`No existing SKU could be updated for group ${skuGroup.id}`);
  }

  const savedSkus = savedSkuRecords.map((record) => record.savedSku);
  const representativeSkuRecord =
    savedSkuRecords.find(
      (record) =>
        record.sourceSku.isOutOfStock !== true
        && record.sourceSku.productImages
        && record.sourceSku.productImages.length > 0,
    )
    ?? savedSkuRecords.find(
      (record) =>
        record.sourceSku.productImages && record.sourceSku.productImages.length > 0,
    )
    ?? savedSkuRecords.find(
      (record) => record.sourceSku.isOutOfStock !== true,
    )
    ?? savedSkuRecords[0];

  const representativeSku = representativeSkuRecord?.savedSku;
  const representativeSkuImages = representativeSkuRecord?.sourceSku.productImages ?? [];

  if (!representativeSku?.uid) {
    throw new Error(`No representative SKU saved for group ${skuGroup.id}`);
  }

  const categoryTerms = skuGroup.categories?.map((category) => ({
    taxonomy_uid: "category",
    term_uid: normalizeCategory(category),
  })) ?? [];
  const brandTerm = buildBrandTerm(skuGroup.brand);
  const firstPricedSku =
    savedSkuRecords.find(
      (record) =>
        record.sourceSku.isOutOfStock !== true
        && record.savedSku.price !== null
        && record.savedSku.price !== undefined,
    )?.savedSku
    ?? savedSkuRecords.find(
      (record) =>
        record.savedSku.price !== null && record.savedSku.price !== undefined,
    )?.savedSku;

  return {
    model_id: skuGroup.id,
    title: skuGroup.title,
    locale_availability: normalizeLocaleAvailability(skuGroup.localeAvailability),
    item_group_id: skuGroup.itemGroupId,
    tags: buildTags(skuGroup),
    variance_code: skuGroup.varianceCode,
    skus: savedSkus.map((sku) => ({
      uid: sku.uid,
      _content_type_uid: "sku",
    })),
    representative_sku: [
      {
        uid: representativeSku.uid,
        _content_type_uid: "sku",
      },
    ],
    taxonomies: [...categoryTerms, brandTerm],
    url: skuGroup.url || undefined,
    slug: skuGroup.slug || undefined,
    weight: skuGroup.weight || undefined,
    garantee: skuGroup.garantee || undefined,
    functionalities: skuGroup.functionalities?.map((func) => ({
      label: func.title,
      value: func.value,
    })),
    materials_and_care: skuGroup.materialAndCare?.map((item) => ({
      label: item.title,
      value: item.value,
    })),
    benefits: skuGroup.benefits?.map((benefit) => ({
      benefit_id: benefit.id ? String(benefit.id) : "",
      label: benefit.label,
      value: benefit.value,
      picto: benefit.picto ? String(benefit.picto) : "",
    })),
    price: firstPricedSku?.price ?? null,
    images: representativeSkuImages.map((image) => ({
      pixl_url: image.pixlUrl,
      alt: image.alt,
      focal_point: "center",
    })),
  };
}
