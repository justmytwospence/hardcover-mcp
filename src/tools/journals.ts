import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";
import { paginationSchema } from "../pagination.js";

const GET_JOURNALS_QUERY = `
  query GetJournals($where: reading_journals_bool_exp, $limit: Int!, $offset: Int!) {
    reading_journals(where: $where, limit: $limit, offset: $offset, order_by: { action_at: desc }) {
      id event entry action_at
      privacy_setting_id likes_count
      book { id title }
      user { id username }
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_journals",
    {
      title: "Get Reading Journals",
      description:
        "Get reading journal entries (notes, quotes, progress updates, status changes). Filter by user_book_id or user_id.",
      inputSchema: z.object({
        user_book_id: z.number().int().optional().describe("Filter by user book ID"),
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
    async ({ user_book_id, user_id, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (user_book_id) where.user_book_id = { _eq: user_book_id };
        if (user_id) where.user_book = { user_id: { _eq: user_id } };

        const data = await graphql<{
          reading_journals: Array<Record<string, unknown>>;
        }>(GET_JOURNALS_QUERY, { where, limit, offset });

        const md = data.reading_journals
          .map((j) => {
            const book = j.book as Record<string, unknown> | undefined;
            const title = book?.title ?? "Unknown";
            const entry = j.entry ? `\n  > ${j.entry}` : "";
            return `- **${title}** [${j.event}] ${j.action_at}${entry}`;
          })
          .join("\n");

        return formatResult(
          { journals: data.reading_journals },
          data.reading_journals.length ? md : "No journal entries found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
