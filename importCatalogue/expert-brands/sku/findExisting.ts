import { getEntries } from "../../contentstack/api.js";
import { Sku } from "../contentstack.types.js";
import { BrandsLocale } from "../types.js";
import { PublishAwareEntry } from "../publish-status.js";

export async function findExisting(
  locale: BrandsLocale,
  skuId: string,
) {
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

  if (
    !(localizedResponse instanceof Error) &&
    localizedResponse.entries.length
  ) {
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
