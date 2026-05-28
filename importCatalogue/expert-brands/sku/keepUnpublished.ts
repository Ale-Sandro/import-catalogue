import { unpublishEntry } from "../../contentstack/api.js";
import { BrandsLocale } from "../types.js";
import { getPublishedEnvironmentNames, PublishAwareEntry } from "../publish-status.js";
import { Sku } from "../contentstack.types.js";

export async function keepUnpublished(params: {
  existingSku: (Sku & PublishAwareEntry) | undefined;
  savedEntry: Sku & { uid: string; _version: number; locale: string };
  locale: BrandsLocale;
  reason: string;
}) {
  const publishedEnvironmentNames = await getPublishedEnvironmentNames(
    params.existingSku,
  );
  const environmentsToUnpublish = publishedEnvironmentNames.filter(
    (environment) => environment === "staging" || environment.startsWith("prod_"),
  );

  if (environmentsToUnpublish.length > 0) {
    await unpublishEntry(
      "sku",
      params.savedEntry.uid,
      environmentsToUnpublish,
      [params.locale],
    );
    console.info(
      "[CS] unpublished SKU because it must stay unpublished",
      {
        uid: params.savedEntry.uid,
        title: params.savedEntry.title,
        locale: params.locale,
        environments: environmentsToUnpublish,
        reason: params.reason,
      },
    );
    return;
  }

  console.info(
    "[CS] kept SKU unpublished",
    {
      uid: params.savedEntry.uid,
      title: params.savedEntry.title,
      locale: params.locale,
      reason: params.reason,
    },
  );
}
