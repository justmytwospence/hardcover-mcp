import { HardcoverApiError } from "./client.js";

export function formatToolError(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
  [key: string]: unknown;
} {
  if (error instanceof HardcoverApiError) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }

  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Error: Request timed out. Try reducing the limit parameter or simplifying the query.",
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: "Error: An unexpected error occurred." }],
  };
}
