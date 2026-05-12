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
  const existingTags = new Set(
    (existingSkuGroup?.tags ?? []).map((tag) => String(tag).toLowerCase()),
  );
  const shouldKeepUnpublished = existingTags.has("unpublished");

  console.info("[CS] SKU_GROUP publication mode", {
    modelId: skuGroup.id,
    itemGroupId: skuGroup.itemGroupId,
    locale,
    mode: shouldKeepUnpublished ? "unpublished(tag)" : "publish",
    contentstackTags: Array.from(existingTags.values()),
  });

  const skuGroupEntry = await buildEntry(skuGroup, locale, {
    ...options,
    keepUnpublished: shouldKeepUnpublished,
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

  if (savedEntry instanceof Error) {
    throw savedEntry;
  }

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
    notice: published instanceof Error ? undefined : published.notice,
  });

  return savedEntry.entry;
}
