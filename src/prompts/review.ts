import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function register(server: McpServer): void {
  server.registerPrompt(
    "reading-year-in-review",
    {
      title: "Reading Year in Review",
      description:
        "Generate a comprehensive summary of your reading for a given year.",
      argsSchema: {
        year: z
          .string()
          .optional()
          .describe("Year to review (defaults to current year)"),
      },
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
                `Generate my ${targetYear} reading year in review.`,
                "Use the hardcover tools to:",
                `1. Get books I read this year (hardcover_get_user_books with status_id=3, look for books with last_read_date in ${targetYear})`,
                `2. Check my reading goals (hardcover_get_goals with year=${targetYear})`,
                `3. Look at my journal entries (hardcover_get_journals)`,
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
