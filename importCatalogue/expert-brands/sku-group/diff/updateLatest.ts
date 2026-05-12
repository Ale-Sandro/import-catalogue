import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export function updateLatest(currentPath: string, latestPath: string) {
  mkdirSync(path.dirname(latestPath), { recursive: true });
  copyFileSync(currentPath, latestPath);
}
