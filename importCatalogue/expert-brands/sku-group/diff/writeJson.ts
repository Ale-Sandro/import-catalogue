import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}
