import {
  ContentTypeUid,
  CreateOrUpdateEntryResponse,
  EntryInput,
  Environment,
  GetEntriesResponse,
  GetEnvironmentsResponse,
  Notice,
  PublishEntryBody,
  UnpublishEntryBody,
} from "./types.js";

type Params = Record<string, string | number | boolean | undefined>;

export class ContentstackApiError extends Error {
  status?: number;
  error_code?: string | number;
  details?: unknown;
  responseBody?: unknown;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function buildRequest(
  path: string,
  locale?: string,
  query?: object,
  params?: Params,
) {
  const contentstackApiKey = readRequiredEnv("CONTENTSTACK_API_KEY");
  const contentstackApiManagementToken = readRequiredEnv(
    "CONTENTSTACK_API_MANAGEMENT_TOKEN",
  );
  const contentstackBranch = readRequiredEnv("CONTENTSTACK_BRANCH");
  const contentstackApiManagementHost = readRequiredEnv(
    "CONTENTSTACK_API_MANAGEMENT_HOST",
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    branch: contentstackBranch,
    authorization: contentstackApiManagementToken,
    api_key: contentstackApiKey,
  };

  const url = new URL(`${contentstackApiManagementHost}${path}`);
  if (locale) {
    url.searchParams.append("locale", locale.toLowerCase());
  }
  if (query) {
    url.searchParams.append("query", JSON.stringify(query));
  }
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.append(key, String(value));
    }
  }

  return { headers, url };
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(url, init);
    const raw = await response.text();

    let body: unknown = undefined;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }

    if (!response.ok) {
      const error = new ContentstackApiError(
        typeof body === "object" && body !== null
          ? String(
              (body as { error_message?: unknown; notice?: unknown })
                .error_message ??
                (body as { notice?: unknown }).notice ??
                response.statusText,
            )
          : response.statusText,
      );
      error.status = response.status;
      error.error_code =
        typeof body === "object" && body !== null
          ? (body as { error_code?: string | number }).error_code
          : undefined;
      error.details =
        typeof body === "object" && body !== null
          ? (body as { errors?: unknown }).errors
          : body;
      error.responseBody = body;

      console.error({
        severity: "ERROR",
        name: "brands-product-portable",
        url,
        status: error.status,
        error_code: error.error_code,
        message: error.message,
        details: error.details,
      });

      throw error;
    }

    return (body ?? {}) as T;
  } catch (error) {
    throw (error instanceof Error ? error : new Error(String(error)));
  }
}

export function getEntries<T>(
  contentTypeUid: ContentTypeUid,
  locale?: string,
  query?: object,
  params?: Params,
) {
  const { headers, url } = buildRequest(
    `/content_types/${contentTypeUid}/entries`,
    locale,
    query,
    params,
  );

  return requestJson<GetEntriesResponse<T>>(url.toString(), {
    method: "GET",
    headers,
  });
}

export function getEnvironments(params?: Params) {
  const { headers, url } = buildRequest(
    "/environments",
    undefined,
    undefined,
    params,
  );

  return requestJson<GetEnvironmentsResponse>(url.toString(), {
    method: "GET",
    headers,
  });
}

export function createEntry<T>(
  contentTypeUid: ContentTypeUid,
  content: EntryInput<T>,
  locale: string,
) {
  const { headers, url } = buildRequest(
    `/content_types/${contentTypeUid}/entries`,
    locale,
  );

  return requestJson<CreateOrUpdateEntryResponse<T>>(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ entry: content }),
  });
}

export function updateEntry<T>(
  contentTypeUid: ContentTypeUid,
  entryUid: string,
  content: EntryInput<T>,
  locale: string,
) {
  const { headers, url } = buildRequest(
    `/content_types/${contentTypeUid}/entries/${entryUid}`,
    locale,
  );

  return requestJson<CreateOrUpdateEntryResponse<T>>(url.toString(), {
    method: "PUT",
    headers,
    body: JSON.stringify({ entry: content }),
  });
}

export function publishEntry(
  contentTypeUid: ContentTypeUid,
  entryUid: string,
  environments: Environment[],
  locales: string[],
  version: number,
  scheduledAt?: string,
) {
  const { headers, url } = buildRequest(
    `/content_types/${contentTypeUid}/entries/${entryUid}/publish`,
  );
  headers.api_version = "3.2";

  const body: PublishEntryBody = {
    entry: {
      environments,
      locales: locales.map((locale) => locale.toLowerCase()),
    },
    locale: locales[0].toLowerCase(),
    version,
    scheduled_at: scheduledAt,
  };

  return requestJson<Notice>(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export function unpublishEntry(
  contentTypeUid: ContentTypeUid,
  entryUid: string,
  environments: Environment[],
  locales: string[],
  scheduledAt?: string,
) {
  const { headers, url } = buildRequest(
    `/content_types/${contentTypeUid}/entries/${entryUid}/unpublish`,
  );

  const body: UnpublishEntryBody = {
    entry: {
      environments,
      locales: locales.map((locale) => locale.toLowerCase()),
    },
    locale: locales[0].toLowerCase(),
    scheduled_at: scheduledAt,
  };

  return requestJson<Notice>(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
