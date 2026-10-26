import { McpServer } from "@modelcontextprotocol/server";
import { PROMPT_BUDGET } from "../guidance.js";

export function register(server: McpServer): void {
  server.registerPrompt(
    "tbr-cleanup",
    {
      title: "TBR Cleanup",
      description: "Audit your want-to-read list and get help prioritizing or trimming it.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              PROMPT_BUDGET,
              "Help me clean up my want-to-read (TBR) list.",
              "Use hardcover_get_user_books with status_id=1 to fetch my TBR shelf.",
              "Use shelf metadata first; fetch details only for at most 3 shortlisted books within budget, not every book. Never remove anything during this review.",
              "",
              "For each book, assess:",
              "- Community rating and popularity",
              "- How long it's been on the shelf (date_added)",
              "- Genre diversity in the list",
              "",
              "Then categorize them into:",
              "- High priority: read soon",
              "- Keep: still interested but no rush",
              "- Consider removing: may no longer match my interests",
              "",
              "Ask me about my current reading interests before making final recommendations.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
