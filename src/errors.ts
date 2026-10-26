import { HardcoverApiError } from "./client.js";
import { formatResult } from "./format.js";

export function formatToolError(error: unknown) {
  const known = error instanceof HardcoverApiError;
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  return {
    ...formatResult(
      {
        error: {
          code: known ? error.code : "INTERNAL_ERROR",
          message,
          ...(known ? { path: error.path, ...error.details } : {}),
        },
      },
      `Error: ${message}`
    ),
    isError: true,
  };
}
