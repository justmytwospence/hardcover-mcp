import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";
import { paginationSchema } from "../pagination.js";
import { USER_BOOK_STATUS_LABELS } from "../types.js";

const GET_ACTIVITY_QUERY = `
  query GetActivity($where: activities_bool_exp, $limit: Int!, $offset: Int!) {
    activities(where: $where, limit: $limit, offset: $offset, order_by: { created_at: desc }) {
      id event created_at data
      user { id username }
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_activity",
    {
      title: "Get Activity Feed",
      description:
        "Get activity feed entries. Optionally filter by user ID. Events include book status changes, ratings, reviews, goal updates, and list changes.",
      inputSchema: z.object({
        user_id: z.number().int().optional().describe("Filter by user ID"),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ user_id, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (user_id) where.user_id = { _eq: user_id };

        const data = await graphql<{
          activities: Array<Record<string, unknown>>;
        }>(GET_ACTIVITY_QUERY, { where, limit, offset });

        const md = data.activities
          .map((a) => {
            const user = a.user as Record<string, unknown> | undefined;
            const activityData = a.data as Record<string, unknown> | undefined;
            const bookTitle = activityData?.book_title ?? activityData?.title ?? "";
            const statusId = activityData?.statusId as number | undefined;
            const status = statusId ? USER_BOOK_STATUS_LABELS[statusId] : "";
            const rating = activityData?.rating as number | undefined;

            let detail = String(a.event);
            if (bookTitle) detail += `: ${bookTitle}`;
            if (status) detail += ` (${status})`;
            if (rating) detail += ` - ${rating}/5`;

            return `- @${user?.username ?? "?"} ${detail} — ${a.created_at}`;
          })
          .join("\n");

        return formatResult(
          { activities: data.activities },
          data.activities.length ? md : "No activity found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
