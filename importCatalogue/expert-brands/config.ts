const DEFAULT_PUBLISH_ENVS = ["staging"];

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

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
