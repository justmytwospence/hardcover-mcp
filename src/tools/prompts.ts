import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";
import { paginationSchema } from "../pagination.js";

const GET_PROMPTS_QUERY = `
  query GetPrompts($where: prompts_bool_exp, $limit: Int!, $offset: Int!) {
    prompts(where: $where, limit: $limit, offset: $offset, order_by: { answers_count: desc_nulls_last }) {
      id question description answers_count books_count users_count
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_prompts",
    {
      title: "Get Prompts",
      description:
        "Get community prompts (discussion questions). Optionally filter by book ID to get prompts related to a specific book.",
      inputSchema: {
        book_id: z.number().int().optional().describe("Filter prompts by book ID"),
        ...paginationSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ book_id, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (book_id) where.prompt_books = { book_id: { _eq: book_id } };

        const data = await graphql<{
          prompts: Array<Record<string, unknown>>;
        }>(GET_PROMPTS_QUERY, { where, limit, offset });

        const md =
          data.prompts
            .map(
              (p) =>
                `- **${p.question}** (${p.answers_count} answers, ${p.books_count} books) [ID: ${p.id}]`
            )
            .join("\n");

        return formatResult(
          { prompts: data.prompts },
          data.prompts.length ? md : "No prompts found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
