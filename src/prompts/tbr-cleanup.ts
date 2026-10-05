import { McpServer } from "@modelcontextprotocol/server";

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
              "Help me clean up my want-to-read (TBR) list.",
              "Use hardcover_get_user_books with status_id=1 to fetch my TBR shelf.",
              "Then for each book, use hardcover_get_book to get more details.",
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
