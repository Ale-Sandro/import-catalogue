import { getEntries } from "../../contentstack/api.js";
import { SkuGroup } from "../contentstack.types.js";
import { PublishAwareEntry } from "../publish-status.js";
import { BrandsLocale } from "../types.js";

export async function findExisting(
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

  if (localizedResponse.entries.length) {
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

  if (anyLocaleResponse.entries.length) {
    return {
      entry: anyLocaleResponse.entries[0],
      localizedMatch: false,
    };
  }

  return undefined;
}
