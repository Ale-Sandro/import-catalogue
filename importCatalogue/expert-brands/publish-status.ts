import { getEnvironments } from "../contentstack/api";
import { Environment } from "../contentstack/types";

import { PublishDetails } from "./contentstack.types";
import { BrandsLocale } from "./types";

export type PublishAwareEntry = {
  publish_details?: PublishDetails | PublishDetails[] | null;
};

let environmentUidByNamePromise: Promise<Map<string, string>> | undefined;

export function normalizePublishDetails(
  value: PublishAwareEntry["publish_details"],
): PublishDetails[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

async function getEnvironmentUidByName(): Promise<Map<string, string>> {
  if (!environmentUidByNamePromise) {
    environmentUidByNamePromise = getEnvironments().then((response) => {
      if (response instanceof Error) {
        throw response;
      }

      const map = new Map<string, string>();
      for (const environment of response.environments ?? []) {
        map.set(String(environment.name).toLowerCase(), String(environment.uid));
      }
      return map;
    });
  }

  return environmentUidByNamePromise;
}

async function resolveTargetEnvironmentIdentifiers(
  environments: readonly Environment[],
): Promise<Set<string>> {
  const environmentUidByName = await getEnvironmentUidByName();
  const resolved = new Set<string>();

  for (const environment of environments) {
    const normalizedName = String(environment).toLowerCase();
    resolved.add(normalizedName);

    const resolvedUid = environmentUidByName.get(normalizedName);
    if (resolvedUid) {
      resolved.add(resolvedUid.toLowerCase());
    }
  }

  return resolved;
}

export async function isPublishedForTargets(
  entry: PublishAwareEntry | undefined,
  locale: BrandsLocale,
  environments: readonly Environment[],
): Promise<boolean> {
  const targetLocale = locale.toLowerCase();
  const targetEnvironmentIdentifiers =
    await resolveTargetEnvironmentIdentifiers(environments);

  return normalizePublishDetails(entry?.publish_details).some((detail) => {
    return (
      targetEnvironmentIdentifiers.has(String(detail.environment).toLowerCase()) &&
      String(detail.locale).toLowerCase() === targetLocale
    );
  });
}

export async function buildPublishDebugSnapshot(
  entry: PublishAwareEntry | undefined,
  locale: BrandsLocale,
  environments: readonly Environment[],
) {
  const publishDetails = normalizePublishDetails(entry?.publish_details).map(
    (detail) => ({
      environment: String(detail.environment),
      locale: String(detail.locale),
      time: String(detail.time),
      user: String(detail.user),
    }),
  );

  return {
    targetLocale: locale,
    targetEnvironments: [...environments],
    targetEnvironmentIdentifiers: Array.from(
      await resolveTargetEnvironmentIdentifiers(environments),
    ),
    publishDetails,
    isPublishedForTargets: await isPublishedForTargets(
      entry,
      locale,
      environments,
    ),
    isPublishedAnywhere:
      normalizePublishDetails(entry?.publish_details).length > 0,
  };
}

export function isPublishedAnywhere(
  entry: PublishAwareEntry | undefined,
): boolean {
  return normalizePublishDetails(entry?.publish_details).length > 0;
}