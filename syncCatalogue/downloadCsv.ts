import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

export async function downloadCsv(
  csvUrl: string,
  destinationPath: string,
): Promise<void> {
  mkdirSync(path.dirname(destinationPath), { recursive: true });

  console.info("[syncCatalogue] downloading CSV", {
    csvUrl,
    destinationPath,
  });

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download CSV '${csvUrl}': ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error(`CSV download '${csvUrl}' returned an empty body.`);
  }

  await pipeline(
    Readable.fromWeb(response.body as WebReadableStream),
    createWriteStream(destinationPath),
  );

  console.info("[syncCatalogue] CSV downloaded", {
    csvUrl,
    destinationPath,
  });
}
