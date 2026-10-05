import { McpServer } from "@modelcontextprotocol/server";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";
import { paginationSchema } from "../pagination.js";
import { z } from "zod";

const GET_NOTIFICATIONS_QUERY = `
  query GetNotifications($limit: Int!, $offset: Int!) {
    notifications(limit: $limit, offset: $offset, order_by: { created_at: desc }) {
      id notification_type_id title description link
      created_at priority
      notifierUser { id username }
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_notifications",
    {
      title: "Get Notifications",
      description: "Get your notifications, newest first.",
      inputSchema: z.object({
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ limit, offset }) => {
      try {
        const data = await graphql<{
          notifications: Array<Record<string, unknown>>;
        }>(GET_NOTIFICATIONS_QUERY, { limit, offset });

        const md = data.notifications
          .map((n) => {
            const from = n.notifierUser
              ? ` from @${(n.notifierUser as Record<string, unknown>).username}`
              : "";
            return `- ${n.title}${from} — ${n.created_at}`;
          })
          .join("\n");

        return formatResult(
          { notifications: data.notifications },
          data.notifications.length ? md : "No notifications."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
