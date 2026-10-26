import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";

export const GET_GOALS_QUERY = `
  query GetGoals($where: goals_bool_exp) {
    goals(where: $where, order_by: { start_date: desc }, limit: 100) {
      id metric goal progress state
      start_date end_date archived
      conditions
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_goals",
    {
      title: "Get Reading Goals",
      description:
        "Get up to 100 reading goals for a user (not a complete history). Goals track books or pages read with a target, progress, and state (active/completed/failed).",
      inputSchema: z.object({
        user_id: z
          .number()
          .int()
          .positive()
          .max(2_147_483_647)
          .optional()
          .describe("User ID (defaults to authenticated user)"),
        year: z.number().int().optional().describe("Filter by year (e.g. 2025)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ user_id, year }) => {
      try {
        const where: Record<string, unknown> = {};

        if (user_id) {
          where.user_id = { _eq: user_id };
        } else {
          const meData = await graphql<{ me: Array<{ id: number }> }>(`
            query {
              me {
                id
              }
            }
          `);
          const myId = meData.me?.[0]?.id;
          if (!myId) throw new Error("Could not determine your user ID; no goals query sent.");
          where.user_id = { _eq: myId };
        }

        if (year) {
          where.start_date = { _gte: `${year}-01-01` };
          where.end_date = { _lte: `${year}-12-31` };
        }

        const data = await graphql<{ goals: Array<Record<string, unknown>> }>(GET_GOALS_QUERY, {
          where,
        });

        const md = data.goals
          .map((g) => {
            const progress = (g.progress as number) ?? 0;
            const goal = (g.goal as number) ?? 0;
            const pct = goal > 0 ? Math.round((progress / goal) * 100) : 0;
            return `- **${g.metric}**: ${progress}/${goal} (${pct}%) — ${g.state} [${g.start_date} to ${g.end_date}]`;
          })
          .join("\n");

        return formatResult(
          { user_id: (where.user_id as { _eq: number })._eq, goals: data.goals },
          data.goals.length ? md : "No goals found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
