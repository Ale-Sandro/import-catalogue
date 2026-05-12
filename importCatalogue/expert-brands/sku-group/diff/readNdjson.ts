import { readFileSync } from "node:fs";

export function readNdjson<T>(filePath: string): T[] {
  const raw = readFileSync(filePath, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
