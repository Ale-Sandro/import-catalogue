import {
  createEntry,
  getEntries,
  publishEntry,
  unpublishEntry,
  updateEntry,
} from "../../contentstack/api";
import { EntryInput } from "../../contentstack/types";

import { Sku } from "../contentstack.types";
import { DatasetSku, DatasetSkuGroup } from "../dataset.types";
import {
  buildPublishDebugSnapshot,
  isPublishedAnywhere,
  isPublishedForTargets,
  PublishAwareEntry,
} from "../publish-status";
import { BRAND_TERM, PUBLISH_ENVS } from "../config";
import { BrandsLocale, normalizeLocaleAvailability } from "../types";

function normalizeTags(
  value: string | string[] | null | undefined,
): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTags(dataset: DatasetSku): string[] {
  const extra = [
    ...normalizeTags(dataset.tags ?? undefined),
    ...normalizeTags(dataset.tag ?? undefined),
  ];
  const merged = new Set<string>(["MIGRATED"]);
  extra.forEach((tag) => merged.add(tag));
  return Array.from(merged.values());
}

function mergeLocaleAvailability(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] {
  const merged = new Set<string>();
  (existing ?? []).forEach((value) => merged.add(String(value)));
  (incoming ?? []).forEach((value) => merged.add(String(value)));
  return Array.from(merged.values());
}

function adaptSku(sku: DatasetSku, skuGroup: DatasetSkuGroup): EntryInput<Sku> {
  return {
    title: sku.title,
    sku_id: sku.skuId,
    sku_code: sku.skuCode,
    locale_availability: normalizeLocaleAvailability(sku.localeAvailability),
    images: sku.productImages?.map((image) => ({
      pixl_url: image.pixlUrl,
      alt: image.alt,
      focal_point: "center",
    })),
    size_label: sku.sizeLabel || "",
    colors: sku.colors?.map((color) => ({
      color_id: String(color.id),
      label: color.label,
      hexa: color.hexa,
    })),
    designed_for: sku.designedFor || undefined,
    catchline: skuGroup.catchline || undefined,
    description: sku.description || undefined,
    price: sku.price || undefined,
    tags: buildTags(sku),
    taxonomies: [BRAND_TERM],
  };
}

async function getExistingContentstackSku(locale: BrandsLocale, skuId: string) {
  const localizedResponse = await getEntries<Sku & PublishAwareEntry>(
    "sku",
    locale,
    {
      sku_id: skuId,
    },
    {
      include_publish_details: true,
      apply_draft: true,
    },
  );

  if (!(localizedResponse instanceof Error) && localizedResponse.entries.length) {
    return {
      entry: localizedResponse.entries[0],
      localizedMatch: true,
    };
  }

  const anyLocaleResponse = await getEntries<Sku & PublishAwareEntry>(
    "sku",
    undefined,
    {
      sku_id: skuId,
    },
    {
      include_publish_details: true,
      apply_draft: true,
    },
  );

  if (!(anyLocaleResponse instanceof Error) && anyLocaleResponse.entries.length) {
    return {
      entry: anyLocaleResponse.entries[0],
      localizedMatch: false,
    };
  }

  return undefined;
}

function publishSku(
  entryUid: string,
  entryVersion: number,
  locale: BrandsLocale,
) {
  return publishEntry("sku", entryUid, PUBLISH_ENVS, [locale], entryVersion);
}

export async function importSku(
  sku: DatasetSku,
  skuGroup: DatasetSkuGroup,
  locale: BrandsLocale,
  options?: {
    preserveImages?: boolean;
    skipPublishIfUnpublished?: boolean;
    publishIfPublishedAnywhere?: boolean;
    forceUnpublish?: boolean;
    debugPublishStatus?: boolean;
  },
) {
  const existingSkuResult = await getExistingContentstackSku(locale, sku.skuId);
  const existingSku = existingSkuResult?.entry;
  const existingSkuPublishedAnywhere = isPublishedAnywhere(existingSku);
  const existingSkuPublishedOnTargets = await isPublishedForTargets(
    existingSku,
    locale,
    PUBLISH_ENVS,
  );
  const shouldPublishExistingSku =
    !options?.skipPublishIfUnpublished ||
    existingSkuPublishedOnTargets ||
    (Boolean(options?.publishIfPublishedAnywhere) &&
      existingSkuPublishedAnywhere);

  if (options?.debugPublishStatus) {
    console.info("[CS][publish-debug] SKU lookup", {
      skuId: sku.skuId,
      skuCode: sku.skuCode,
      requestedLocale: locale,
      existingUid: existingSku?.uid ?? null,
      existingEntryLocale: existingSku?.locale ?? null,
      localizedMatch: existingSkuResult?.localizedMatch ?? null,
      skipPublishIfUnpublished: Boolean(options.skipPublishIfUnpublished),
      publishIfPublishedAnywhere: Boolean(options.publishIfPublishedAnywhere),
      existingSkuPublishedAnywhere,
      existingSkuPublishedOnTargets,
      forceUnpublish: Boolean(options.forceUnpublish),
      ...(await buildPublishDebugSnapshot(existingSku, locale, PUBLISH_ENVS)),
    });
  }

  const adaptedSku = adaptSku(sku, skuGroup);
  if (existingSku && existingSkuResult?.localizedMatch) {
    adaptedSku.locale_availability = mergeLocaleAvailability(
      existingSku.locale_availability,
      adaptedSku.locale_availability,
    );
  }
  if (existingSku && existingSkuResult?.localizedMatch && options?.preserveImages) {
    adaptedSku.images = existingSku.images;
  }

  let savedEntry;
  if (existingSku) {
    savedEntry = await updateEntry<Sku>("sku", existingSku.uid, adaptedSku, locale);
  } else {
    savedEntry = await createEntry<Sku>("sku", adaptedSku, locale);
  }

  if (savedEntry instanceof Error) {
    throw savedEntry;
  }

  if (options?.forceUnpublish) {
    if (existingSku && existingSkuPublishedOnTargets) {
      await unpublishEntry("sku", savedEntry.entry.uid, PUBLISH_ENVS, [locale]);
      console.info("[CS] unpublished SKU because parent SKU_GROUP is unpublished", {
        uid: savedEntry.entry.uid,
        title: savedEntry.entry.title,
        locale,
      });
    } else {
      console.info("[CS] kept SKU unpublished because parent SKU_GROUP is unpublished", {
        uid: savedEntry.entry.uid,
        title: savedEntry.entry.title,
        locale,
      });
    }
    return savedEntry.entry;
  }

  if (existingSku && !shouldPublishExistingSku) {
    console.info("[CS] skipped publish for unpublished SKU", {
      uid: savedEntry.entry.uid,
      title: savedEntry.entry.title,
      locale,
    });
    return savedEntry.entry;
  }

  if (options?.debugPublishStatus) {
    console.info("[CS][publish-debug] SKU publish allowed", {
      skuId: sku.skuId,
      skuCode: sku.skuCode,
      existingUid: existingSku?.uid ?? null,
      requestedLocale: locale,
      shouldPublishExistingSku,
    });
  }

  await publishSku(savedEntry.entry.uid, savedEntry.entry._version, locale);

  return savedEntry.entry;
}