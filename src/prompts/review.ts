import { McpServer } from "@modelcontextprotocol/server";
import { PROMPT_BUDGET } from "../guidance.js";
import { z } from "zod";

export function register(server: McpServer): void {
  server.registerPrompt(
    "reading-year-in-review",
    {
      title: "Reading Year in Review",
      description: "Generate a comprehensive summary of your reading for a given year.",
      argsSchema: z.object({
        year: z
          .string()
          .regex(/^\d{4}$/)
          .optional()
          .describe("Year to review (defaults to current year)"),
      }),
    },
    async ({ year }) => {
      const targetYear = year || String(new Date().getFullYear());

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                PROMPT_BUDGET,
                `Generate my ${targetYear} reading year in review.`,
                "Use the hardcover tools to:",
                `1. Get books I read this year (hardcover_get_user_books with status_id=3, look for books with last_read_date in ${targetYear})`,
                `2. Check my reading goals (hardcover_get_goals with year=${targetYear})`,
                `3. Look at my journal entries (hardcover_get_journals with my known user_id); do not mistake an unfiltered feed for my history`,
                "",
                "Then produce a summary covering:",
                "- Total books read and pages",
                "- Goal progress",
                "- Highest and lowest rated books",
                "- Genre/theme patterns",
                "- Highlights and memorable quotes from journals",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}
