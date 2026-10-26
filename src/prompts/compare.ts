import { McpServer } from "@modelcontextprotocol/server";
import { PROMPT_BUDGET } from "../guidance.js";
import { z } from "zod";

export function register(server: McpServer): void {
  server.registerPrompt(
    "compare-books",
    {
      title: "Compare Books",
      description: "Side-by-side comparison of two books to help decide what to read.",
      argsSchema: z.object({
        book_id_1: z
          .string()
          .regex(/^[1-9]\d*$/)
          .refine((v) => Number(v) <= 2_147_483_647)
          .describe("First book's Hardcover ID"),
        book_id_2: z
          .string()
          .regex(/^[1-9]\d*$/)
          .refine((v) => Number(v) <= 2_147_483_647)
          .describe("Second book's Hardcover ID"),
      }),
    },
    async ({ book_id_1, book_id_2 }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              PROMPT_BUDGET,
              "Two book details cost 2 first-attempt fields; reuse any already known data.",
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
