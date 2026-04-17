const DEFAULT_BRAND_TERM_UID = "van_rysel";
const DEFAULT_PUBLISH_ENVS = ["staging"];

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export const BRAND_TAXONOMY_UID = "brand";
export const BRAND_TERM_UID =
  readEnv("EXPERT_BRANDS_BRAND_TERM_UID") ?? DEFAULT_BRAND_TERM_UID;

export const PUBLISH_ENVS = (() => {
  const raw = readEnv("EXPERT_BRANDS_PUBLISH_ENVS");
  if (!raw) {
    return DEFAULT_PUBLISH_ENVS;
  }
  const parsed = raw
    .split(",")
    .map((env) => env.trim())
    .filter(Boolean);
  return parsed.length ? parsed : DEFAULT_PUBLISH_ENVS;
})();

export const BRAND_TERM = {
  taxonomy_uid: BRAND_TAXONOMY_UID,
  term_uid: BRAND_TERM_UID,
};