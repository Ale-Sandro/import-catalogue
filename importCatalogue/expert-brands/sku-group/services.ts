import {
  createEntry,
  getEntries,
  publishEntry,
  updateEntry,
} from "../../contentstack/api.js";
import { EntryInput } from "../../contentstack/types.js";

import { importSku } from "../sku/services.js";
import { SkuGroup } from "../contentstack.types.js";
import { DatasetSkuGroup } from "../dataset.types.js";
import {
  buildPublishDebugSnapshot,
  isPublishedForTargets,
  isPublishedAnywhere,
  PublishAwareEntry,
} from "../publish-status.js";
import { BRAND_TERM, PUBLISH_ENVS } from "../config.js";
import {
  BrandsLocale,
  SkuGroupInput,
  normalizeLocaleAvailability,
} from "../types.js";

const REDUCE_BURST_DELAY_MS = 300;

type ImportSkuGroupOptions = {
  preserveImages?: boolean;
  preserveImagesForCategories?: string[];
  preserveCategories?: boolean;
  skipPublishIfUnpublished?: boolean;
  publishIfPublishedAnywhere?: boolean;
  debugPublishStatus?: boolean;
  reduceBurst?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeTags(value: string | string[] | null | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTags(dataset: DatasetSkuGroup): string[] {
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

function mapLocaleAvailabilityForSkuGroup(
  locales: readonly BrandsLocale[],
): string[] {
  const mapped = new Set<string>(locales);
  if (locales.includes("en-us")) {
    mapped.add("us");
  }
  return Array.from(mapped);
}

function adaptTermUid(category: string): string {
  return category.toLowerCase().replace(/__/g, "_");
}

function shouldPreserveImagesForSkuGroup(
  skuGroup: DatasetSkuGroup,
  options?: ImportSkuGroupOptions,
): boolean {
  if (options?.preserveImages) {
    return true;
  }

  const requestedCategories = new Set(
    (options?.preserveImagesForCategories ?? []).map((category) =>
      adaptTermUid(category),
    ),
  );

  if (!requestedCategories.size) {
    return false;
  }

  return (skuGroup.categories ?? []).some((category) =>
    requestedCategories.has(adaptTermUid(category)),
  );
}

async function adaptSkuGroup(
  skuGroup: DatasetSkuGroup,
  locale: BrandsLocale,
  options?: ImportSkuGroupOptions,
): Promise<EntryInput<SkuGroupInput>> {
  const preserveImagesForThisGroup = shouldPreserveImagesForSkuGroup(
    skuGroup,
    options,
  );
  const forceUnpublishSkus = Boolean(options?.skipPublishIfUnpublished);

  const importSkuWithRetry = async (sku: DatasetSkuGroup["skus"][number]) => {
    try {
      const savedSku = await importSku(sku, skuGroup, locale, {
        preserveImages: preserveImagesForThisGroup,
        skipPublishIfUnpublished: options?.skipPublishIfUnpublished,
        publishIfPublishedAnywhere: options?.publishIfPublishedAnywhere,
        forceUnpublish: forceUnpublishSkus,
        debugPublishStatus: options?.debugPublishStatus,
      });
      return savedSku;
    } catch {
      console.info(
        `Retry import SKU ${sku.skuId} for SKU Group ${skuGroup.id}`,
      );
      return importSku(sku, skuGroup, locale, {
        preserveImages: preserveImagesForThisGroup,
        skipPublishIfUnpublished: options?.skipPublishIfUnpublished,
        publishIfPublishedAnywhere: options?.publishIfPublishedAnywhere,
        forceUnpublish: forceUnpublishSkus,
        debugPublishStatus: options?.debugPublishStatus,
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
    const results = await Promise.all(
      skuGroup.skus.map((sku) => importSkuWithRetry(sku)),
    );
    savedSkus.push(...results);
  }

  if (!savedSkus.length || !savedSkus[0]?.uid) {
    throw new Error(`No representative SKU saved for group ${skuGroup.id}`);
  }

  const categoryTerms = options?.preserveCategories
    ? []
    : (skuGroup.categories?.map((category) => ({
        taxonomy_uid: "category",
        term_uid: adaptTermUid(category),
      })) ?? []);
  const firstPricedSku = savedSkus.find(
    (sku) => sku.price !== null && sku.price !== undefined,
  );

  return {
    model_id: skuGroup.id,
    title: skuGroup.title,
    locale_availability: mapLocaleAvailabilityForSkuGroup(
      normalizeLocaleAvailability(skuGroup.localeAvailability),
    ),
    item_group_id: skuGroup.itemGroupId,
    tags: buildTags(skuGroup),
    variance_code: skuGroup.varianceCode,
    skus: savedSkus.map((sku) => ({
      uid: sku.uid,
      _content_type_uid: "sku",
    })),
    representative_sku: [
      {
        uid: savedSkus[0].uid,
        _content_type_uid: "sku",
      },
    ],
    taxonomies: [...categoryTerms, BRAND_TERM],
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
    images: savedSkus[0].images?.map((image) => ({
      pixl_url: image.pixl_url,
      alt: image.alt,
      focal_point: "center",
    })),
  };
}

async function getExistingContentstackSkuGroup(
  locale: BrandsLocale,
  modelId: string,
) {
  const localizedResponse = await getEntries<SkuGroup & PublishAwareEntry>(
    "sku_group",
    locale,
    {
      model_id: modelId,
    },
    {
      include_publish_details: true,
      apply_draft: true,
    },
  );

  if (
    !(localizedResponse instanceof Error) &&
    localizedResponse.entries.length
  ) {
    return {
      entry: localizedResponse.entries[0],
      localizedMatch: true,
    };
  }

  const anyLocaleResponse = await getEntries<SkuGroup & PublishAwareEntry>(
    "sku_group",
    undefined,
    {
      model_id: modelId,
    },
    {
      include_publish_details: true,
      apply_draft: true,
    },
  );

  if (
    !(anyLocaleResponse instanceof Error) &&
    anyLocaleResponse.entries.length
  ) {
    return {
      entry: anyLocaleResponse.entries[0],
      localizedMatch: false,
    };
  }

  return undefined;
}

function publishSkuGroup(
  entryUid: string,
  entryVersion: number,
  locale: BrandsLocale,
) {
  return publishEntry(
    "sku_group",
    entryUid,
    PUBLISH_ENVS,
    [locale],
    entryVersion,
  );
}

export async function importSkuGroup(
  skuGroup: DatasetSkuGroup,
  locale: BrandsLocale,
  options?: ImportSkuGroupOptions,
) {
  const existingSkuGroupResult = await getExistingContentstackSkuGroup(
    locale,
    skuGroup.id,
  );
  const existingSkuGroup = existingSkuGroupResult?.entry;
  const existingSkuGroupPublishedAnywhere =
    isPublishedAnywhere(existingSkuGroup);
  const existingSkuGroupPublishedOnTargets = await isPublishedForTargets(
    existingSkuGroup,
    locale,
    PUBLISH_ENVS,
  );
  const shouldPublishExistingSkuGroup =
    !options?.skipPublishIfUnpublished ||
    existingSkuGroupPublishedOnTargets ||
    (Boolean(options?.publishIfPublishedAnywhere) &&
      existingSkuGroupPublishedAnywhere);
  const forceUnpublishChildSkus =
    Boolean(options?.skipPublishIfUnpublished) &&
    Boolean(existingSkuGroup) &&
    !existingSkuGroupPublishedOnTargets &&
    !(
      Boolean(options?.publishIfPublishedAnywhere) &&
      existingSkuGroupPublishedAnywhere
    );

  if (options?.debugPublishStatus) {
    console.info("[CS][publish-debug] SKU_GROUP lookup", {
      modelId: skuGroup.id,
      itemGroupId: skuGroup.itemGroupId,
      requestedLocale: locale,
      existingUid: existingSkuGroup?.uid ?? null,
      existingEntryLocale: existingSkuGroup?.locale ?? null,
      localizedMatch: existingSkuGroupResult?.localizedMatch ?? null,
      skipPublishIfUnpublished: Boolean(options.skipPublishIfUnpublished),
      publishIfPublishedAnywhere: Boolean(options.publishIfPublishedAnywhere),
      existingSkuGroupPublishedAnywhere,
      existingSkuGroupPublishedOnTargets,
      forceUnpublishChildSkus,
      ...(await buildPublishDebugSnapshot(
        existingSkuGroup,
        locale,
        PUBLISH_ENVS,
      )),
    });
  }

  const preserveImagesForThisGroup = shouldPreserveImagesForSkuGroup(
    skuGroup,
    options,
  );
  const adaptedSkuGroup = await adaptSkuGroup(skuGroup, locale, {
    ...options,
    skipPublishIfUnpublished: forceUnpublishChildSkus,
  });
  if (existingSkuGroup && existingSkuGroupResult?.localizedMatch) {
    adaptedSkuGroup.locale_availability = mergeLocaleAvailability(
      [...existingSkuGroup.locale_availability],
      adaptedSkuGroup.locale_availability,
    );
  }
  if (
    existingSkuGroup &&
    existingSkuGroupResult?.localizedMatch &&
    preserveImagesForThisGroup
  ) {
    adaptedSkuGroup.images = existingSkuGroup.images
      ? [...existingSkuGroup.images]
      : undefined;
  }
  if (options?.preserveCategories) {
    const existingCategoryTerms = (existingSkuGroup?.taxonomies ?? []).filter(
      (taxonomy) => taxonomy.taxonomy_uid === "category",
    );
    adaptedSkuGroup.taxonomies = [...existingCategoryTerms, BRAND_TERM];
  }

  let savedEntry;
  if (existingSkuGroup) {
    savedEntry = await updateEntry<SkuGroupInput>(
      "sku_group",
      existingSkuGroup.uid,
      adaptedSkuGroup,
      locale,
    );
    if (!(savedEntry instanceof Error)) {
      console.info("[CS] updated SKU_GROUP", {
        uid: savedEntry.entry.uid,
        title: savedEntry.entry.title,
        locale,
      });
    }
  } else {
    savedEntry = await createEntry<SkuGroupInput>(
      "sku_group",
      adaptedSkuGroup,
      locale,
    );
    if (!(savedEntry instanceof Error)) {
      console.info("[CS] created SKU_GROUP", {
        uid: savedEntry.entry.uid,
        title: savedEntry.entry.title,
        locale,
      });
    }
  }

  if (savedEntry instanceof Error) {
    throw savedEntry;
  }

  if (existingSkuGroup && !shouldPublishExistingSkuGroup) {
    console.info("[CS] skipped publish for unpublished SKU_GROUP", {
      uid: savedEntry.entry.uid,
      title: savedEntry.entry.title,
      locale,
    });
  } else {
    if (options?.debugPublishStatus) {
      console.info("[CS][publish-debug] SKU_GROUP publish allowed", {
        modelId: skuGroup.id,
        itemGroupId: skuGroup.itemGroupId,
        existingUid: existingSkuGroup?.uid ?? null,
        requestedLocale: locale,
        shouldPublishExistingSkuGroup,
      });
    }

    const pub = await publishSkuGroup(
      savedEntry.entry.uid,
      savedEntry.entry._version,
      locale,
    );

    console.info("[CS] published SKU_GROUP", {
      uid: savedEntry.entry.uid,
      envs: PUBLISH_ENVS,
      locale,
      notice: pub instanceof Error ? undefined : pub.notice,
    });
  }

  return savedEntry.entry;
}
