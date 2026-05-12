import { formatDetails } from "./formatDetails.js";
import { truncate } from "./truncate.js";

export function formatError(
  fileName: string,
  err: unknown,
  phase: "initial" | "final",
): string {
  const prefix =
    phase === "initial"
      ? `Attempt failed importing ${fileName}`
      : `Failed importing ${fileName} after retry`;

  if (!err || typeof err !== "object") {
    return `${prefix}: ${String(err)}`;
  }

  const errorObj = err as {
    message?: string;
    status?: number;
    error_code?: number | string;
    details?: unknown;
  };

  const message =
    err instanceof Error
      ? err.message
      : (errorObj.message ?? "Unknown error from Contentstack");
  const status = errorObj.status;
  const errorCode = errorObj.error_code;
  const details = formatDetails(errorObj.details);

  const contextParts = [
    status ? `status ${status}` : null,
    errorCode ? `code ${errorCode}` : null,
  ].filter(Boolean);

  const context =
    contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";
  const detailSuffix = details ? ` - ${truncate(details)}` : "";

  return `${prefix}${context}: ${truncate(message)}${detailSuffix}`;
}
