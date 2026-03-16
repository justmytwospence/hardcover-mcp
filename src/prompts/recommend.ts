import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function register(server: McpServer): void {
  server.registerPrompt(
    "recommend-next-read",
    {
      title: "Recommend Next Read",
      description:
        "Get a personalized book recommendation based on your library, reading history, and mood.",
      argsSchema: {
        mood: z
          .string()
          .optional()
          .describe(
            "Reading mood: light, challenging, quick, epic, comforting, adventurous"
          ),
        genre: z
          .string()
          .optional()
          .describe("Preferred genre for this recommendation"),
      },
    },
    async ({ mood, genre }) => {
      const parts = [
        "Recommend my next read from my Hardcover library.",
        "Use the hardcover tools to:",
        "1. Check what I'm currently reading (hardcover_get_user_books with status_id=2)",
        "2. Look at my want-to-read shelf (hardcover_get_user_books with status_id=1)",
        "3. Review my recently finished books (hardcover_get_user_books with status_id=3)",
        "",
        "Then suggest 1-3 books with reasoning for each pick.",
      ];
      if (mood) parts.push(`\nMood: I'm looking for something ${mood}.`);
      if (genre) parts.push(`\nGenre preference: ${genre}.`);

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: parts.join("\n") },
          },
        ],
      };
    }
  );
}
