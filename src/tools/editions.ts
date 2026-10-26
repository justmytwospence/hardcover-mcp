import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult, formatEdition } from "../format.js";
import { paginationSchema, computePage } from "../pagination.js";

const FIND_EDITIONS_QUERY = `
  query FindEditions($where: editions_bool_exp, $limit: Int!, $offset: Int!) {
    editions(where: $where, limit: $limit, offset: $offset, order_by: { users_count: desc_nulls_last }) {
      id title isbn_13 isbn_10 asin pages audio_seconds
      edition_format physical_format release_date
      reading_format_id users_count rating
      publisher { id name }
      language { language }
      country { name }
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_find_editions",
    {
      title: "Find Editions",
      description:
        "Find editions of a book. Filter by book ID, ISBN-13, ISBN-10, or ASIN. Returns edition details including format, publisher, and page count.",
      inputSchema: z.object({
        book_id: z
          .number()
          .int()
          .positive()
          .max(2_147_483_647)
          .optional()
          .describe("Filter by Hardcover book ID"),
        isbn_13: z.string().optional().describe("Filter by ISBN-13"),
        isbn_10: z.string().optional().describe("Filter by ISBN-10"),
        asin: z.string().optional().describe("Filter by Amazon ASIN"),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ book_id, isbn_13, isbn_10, asin, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (book_id) where.book_id = { _eq: book_id };
        if (isbn_13) where.isbn_13 = { _eq: isbn_13 };
        if (isbn_10) where.isbn_10 = { _eq: isbn_10 };
        if (asin) where.asin = { _eq: asin };

        if (Object.keys(where).length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Provide at least one filter (book_id, isbn_13, isbn_10, or asin).",
              },
            ],
            isError: true,
          };
        }

        const data = await graphql<{
          editions: Array<Record<string, unknown>>;
        }>(FIND_EDITIONS_QUERY, { where, limit, offset });

        const md = data.editions.map(formatEdition).join("\n");

        return formatResult(
          { editions: data.editions, pagination: computePage(data.editions.length, limit, offset) },
          md || "No editions found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
