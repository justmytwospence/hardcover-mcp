import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function register(server: McpServer): void {
  server.registerPrompt(
    "compare-books",
    {
      title: "Compare Books",
      description:
        "Side-by-side comparison of two books to help decide what to read.",
      argsSchema: {
        book_id_1: z.string().describe("First book's Hardcover ID"),
        book_id_2: z.string().describe("Second book's Hardcover ID"),
      },
    },
    async ({ book_id_1, book_id_2 }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Compare these two books side by side.`,
              `Use hardcover_get_book to fetch details for book ID ${book_id_1} and book ID ${book_id_2}.`,
              "",
              "Then provide a structured comparison covering:",
              "- Genre and themes",
              "- Length and estimated reading time",
              "- Community ratings and popularity",
              "- Writing style and tone (from description/tags)",
              "- Who each book is best suited for",
              "- Your recommendation on which to read first and why",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
