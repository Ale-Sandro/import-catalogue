export type Environment = string;

export type ContentTypeUid = "sku_group" | "sku";

export type Entry<T> = T & {
  uid: string;
  locale: string;
  _version: number;
  tags?: string[];
};

export type EntryInput<T> = T & {
  tags?: string[];
};

export type GetEntriesResponse<T> = {
  entries: Entry<T>[];
};

export type ContentstackEnvironment = {
  uid: string;
  name: string;
};

export type GetEnvironmentsResponse = {
  environments: ContentstackEnvironment[];
};

export type CreateOrUpdateEntryResponse<T> = {
  notice: string;
  entry: Entry<T>;
};

export type ReferencedEntry = {
  uid: string;
  _content_type_uid: ContentTypeUid;
};

export type Notice = {
  notice: string;
};

export type PublishEntryBody = {
  entry: {
    environments: Environment[];
    locales: string[];
  };
  locale: string;
  version: number;
  scheduled_at?: string;
};

export type UnpublishEntryBody = {
  entry: {
    environments: Environment[];
    locales: string[];
  };
  locale: string;
  scheduled_at?: string;
};