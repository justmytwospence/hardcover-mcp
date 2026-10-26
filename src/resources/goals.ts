import { McpServer } from "@modelcontextprotocol/server";
import { graphql } from "../client.js";
import { boundText } from "../format.js";
import { GET_GOALS_QUERY } from "../tools/goals.js";

export function register(server: McpServer): void {
  server.registerResource(
    "goals",
    "hardcover://goals",
    {
      description:
        "Up to two API fields per read before retries (me + goals). Current-year reading goals, at most 100, text capped at 25000 characters. Not a complete history.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const meData = await graphql<{ me: Array<{ id: number }> }>(`
        query {
          me {
            id
          }
        }
      `);
      const myId = meData.me?.[0]?.id;
      if (!myId) {
        return {
          contents: [
            {
              uri: uri.href,
              text: "Could not determine user ID.",
              mimeType: "text/plain",
            },
          ],
        };
      }

      const year = new Date().getFullYear();
      const data = await graphql<{
        goals: Array<Record<string, unknown>>;
      }>(GET_GOALS_QUERY, {
        where: {
          user_id: { _eq: myId },
          start_date: { _gte: `${year}-01-01` },
          end_date: { _lte: `${year}-12-31` },
        },
      });

      if (!data.goals.length) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `No reading goals found for ${year}.`,
              mimeType: "text/plain",
            },
          ],
        };
      }

      const text = data.goals
        .map((g) => {
          const progress = (g.progress as number) ?? 0;
          const goal = (g.goal as number) ?? 0;
          const pct = goal > 0 ? Math.round((progress / goal) * 100) : 0;
          return `- ${g.metric}: ${progress}/${goal} (${pct}%) -- ${g.state} [${g.start_date} to ${g.end_date}]`;
        })
        .join("\n");

      return {
        contents: [{ uri: uri.href, text: boundText(text), mimeType: "text/plain" }],
      };
    }
  );
}
