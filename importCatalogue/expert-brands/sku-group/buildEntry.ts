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
      });
    } catch {
      console.info(`Retry import SKU ${sku.skuId} for SKU Group ${skuGroup.id}`);
      return importSku(sku, skuGroup, locale, {
        keepUnpublished: options?.keepUnpublished,
        keepUnpublishedReason: options?.keepUnpublishedReason,
      });
    }
  };

  const savedSkus: Awaited<ReturnType<typeof importSkuWithRetry>>[] = [];
  if (options?.reduceBurst) {
    for (let index = 0; index < skuGroup.skus.length; index += 1) {
      const sku = skuGroup.skus[index];
      savedSkus.push(await importSkuWithRetry(sku));
      if (index < skuGroup.skus.length - 1) {
        await sleep(REDUCE_BURST_DELAY_MS);
      }
    }
  } else {
    savedSkus.push(
      ...(await Promise.all(skuGroup.skus.map((sku) => importSkuWithRetry(sku)))),
    );
  }

  const representativeSku =
    savedSkus.find((sku) => sku.images && sku.images.length > 0) ?? savedSkus[0];

  if (!representativeSku?.uid) {
    throw new Error(`No representative SKU saved for group ${skuGroup.id}`);
  }

  const categoryTerms = skuGroup.categories?.map((category) => ({
    taxonomy_uid: "category",
    term_uid: normalizeCategory(category),
  })) ?? [];
  const brandTerm = buildBrandTerm(skuGroup.brand);
  const firstPricedSku = savedSkus.find(
    (sku) => sku.price !== null && sku.price !== undefined,
  );

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
    price: firstPricedSku?.price ?? undefined,
    images: representativeSku.images?.map((image) => ({
      pixl_url: image.pixl_url,
      alt: image.alt,
      focal_point: "center",
    })),
  };
}
