import { getEnvironments } from "../contentstack/api.js";

import { PublishDetails } from "./contentstack.types.js";

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
      const map = new Map<string, string>();
      for (const environment of response.environments ?? []) {
        map.set(
          String(environment.name).toLowerCase(),
          String(environment.uid),
        );
      }
      return map;
    });
  }

  return environmentUidByNamePromise;
}

export async function getPublishedEnvironmentNames(
  entry: PublishAwareEntry | undefined,
): Promise<string[]> {
  const publishDetails = normalizePublishDetails(entry?.publish_details);
  if (!publishDetails.length) {
    return [];
  }

  const environmentUidByName = await getEnvironmentUidByName();
  const environmentNameByUid = new Map<string, string>();

  for (const [name, uid] of environmentUidByName.entries()) {
    environmentNameByUid.set(uid.toLowerCase(), name);
  }

  const names = new Set<string>();

  for (const detail of publishDetails) {
    const rawEnvironment = String(detail.environment).toLowerCase();
    names.add(environmentNameByUid.get(rawEnvironment) ?? rawEnvironment);
  }

  return Array.from(names.values());
}
