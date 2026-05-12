import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function writeNdjson<T>(filePath: string, items: T[]) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const content = items.map((item) => JSON.stringify(item)).join("\n");
  writeFileSync(filePath, content ? `${content}\n` : "", "utf-8");
}
