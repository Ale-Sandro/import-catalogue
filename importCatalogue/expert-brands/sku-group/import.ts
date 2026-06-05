import { createEntry, updateEntry } from "../../contentstack/api.js";
import { mergeLocaleAvailability } from "../shared/mergeLocaleAvailability.js";
import { PUBLISH_ENVS } from "../config.js";
import { DatasetSkuGroup } from "../dataset.types.js";
import { BrandsLocale, SkuGroupInput } from "../types.js";
import { buildEntry } from "./buildEntry.js";
import { findExisting } from "./findExisting.js";
import { ImportSkuGroupOptions } from "./options.js";
import { keepUnpublished as keepGroupUnpublished } from "./keepUnpublished.js";
import { publish } from "./publish.js";

export async function importSkuGroup(
  skuGroup: DatasetSkuGroup,
  locale: BrandsLocale,
  options?: ImportSkuGroupOptions,
) {
  const existingSkuGroupResult = await findExisting(locale, skuGroup.id);
  const existingSkuGroup = existingSkuGroupResult?.entry;

  if (options?.requireExisting && !existingSkuGroup) {
    console.info(
      "[CS] skipping SKU_GROUP because it does not exist for update-only flow",
      {
        modelId: skuGroup.id,
        itemGroupId: skuGroup.itemGroupId,
        locale,
      },
    );
    return null;
  }

  const existingTags = new Set(
    (existingSkuGroup?.tags ?? []).map((tag) => String(tag).toLowerCase()),
  );
  const keepUnpublishedReasons = new Set<string>();
  if (existingTags.has("unpublished")) {
    keepUnpublishedReasons.add("contentstack_tag_unpublished");
  }
  if (options?.keepUnpublishedReason) {
    keepUnpublishedReasons.add(options.keepUnpublishedReason);
  }
  const shouldKeepUnpublished =
    options?.keepUnpublished === true || keepUnpublishedReasons.size > 0;
  const keepUnpublishedReason =
    Array.from(keepUnpublishedReasons.values()).join(", ") || "manual";

  console.info("[CS] SKU_GROUP publication mode", {
    modelId: skuGroup.id,
    itemGroupId: skuGroup.itemGroupId,
    locale,
    mode: shouldKeepUnpublished
      ? `unpublished(${keepUnpublishedReason})`
      : "publish",
    contentstackTags: Array.from(existingTags.values()),
  });

  const skuGroupEntry = await buildEntry(skuGroup, locale, {
    ...options,
    keepUnpublished: shouldKeepUnpublished,
    keepUnpublishedReason,
  });

  if (existingSkuGroup && existingSkuGroupResult?.localizedMatch) {
    skuGroupEntry.locale_availability = mergeLocaleAvailability(
      [...existingSkuGroup.locale_availability],
      skuGroupEntry.locale_availability,
    );
  }

  const savedEntry = existingSkuGroup
    ? await updateEntry<SkuGroupInput>(
        "sku_group",
        existingSkuGroup.uid,
        skuGroupEntry,
        locale,
      )
    : await createEntry<SkuGroupInput>("sku_group", skuGroupEntry, locale);

  console.info(
    existingSkuGroup ? "[CS] updated SKU_GROUP" : "[CS] created SKU_GROUP",
    {
      uid: savedEntry.entry.uid,
      title: savedEntry.entry.title,
      locale,
    },
  );

  if (shouldKeepUnpublished) {
    await keepGroupUnpublished({
      existingSkuGroup,
      savedEntry: savedEntry.entry,
      locale,
      reason: keepUnpublishedReason,
    });
    return savedEntry.entry;
  }

  const published = await publish(
    savedEntry.entry.uid,
    savedEntry.entry._version,
    locale,
  );

  console.info("[CS] published SKU_GROUP", {
    uid: savedEntry.entry.uid,
    envs: PUBLISH_ENVS,
    locale,
    notice: published.notice,
  });

  return savedEntry.entry;
}
