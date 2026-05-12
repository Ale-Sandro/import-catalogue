import { unpublishEntry } from "../../contentstack/api.js";
import { SkuGroup } from "../contentstack.types.js";
import { getPublishedEnvironmentNames, PublishAwareEntry } from "../publish-status.js";
import { BrandsLocale } from "../types.js";

export async function keepUnpublished(params: {
  existingSkuGroup: (SkuGroup & PublishAwareEntry) | undefined;
  savedEntry: { uid: string; _version: number; locale: string; title: string };
  locale: BrandsLocale;
}) {
  const publishedEnvironmentNames = await getPublishedEnvironmentNames(
    params.existingSkuGroup,
  );
  const environmentsToUnpublish = publishedEnvironmentNames.filter(
    (environment) => environment === "staging" || environment.startsWith("prod_"),
  );

  if (environmentsToUnpublish.length > 0) {
    await unpublishEntry(
      "sku_group",
      params.savedEntry.uid,
      environmentsToUnpublish,
      [params.locale],
    );
    console.info(
      "[CS] unpublished SKU_GROUP because it is tagged unpublished",
      {
        uid: params.savedEntry.uid,
        title: params.savedEntry.title,
        locale: params.locale,
        environments: environmentsToUnpublish,
      },
    );
    return;
  }

  console.info(
    "[CS] kept SKU_GROUP unpublished because it is tagged unpublished",
    {
      uid: params.savedEntry.uid,
      title: params.savedEntry.title,
      locale: params.locale,
    },
  );
}
