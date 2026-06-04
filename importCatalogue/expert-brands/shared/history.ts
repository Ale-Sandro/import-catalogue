import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export function createHistoryRunLabel(date = new Date()): string {
  return date.toISOString().replace(/:/g, "-");
}

export function archiveFileToHistory(
  filePath: string,
  runLabel: string,
): string {
  const historyDir = path.join(path.dirname(filePath), "history");
  mkdirSync(historyDir, { recursive: true });

  const historyPath = path.join(
    historyDir,
    `${runLabel}-${path.basename(filePath)}`,
  );
  copyFileSync(filePath, historyPath);
  return historyPath;
}
