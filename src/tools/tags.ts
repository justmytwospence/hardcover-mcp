import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";
import { paginationSchema, computePagination, formatPaginationNote } from "../pagination.js";
import { TAG_CATEGORY_LABELS } from "../types.js";

const GET_TAGS_QUERY = `
  query GetTags($where: tags_bool_exp, $limit: Int!, $offset: Int!) {
    tags(where: $where, limit: $limit, offset: $offset, order_by: { count: desc_nulls_last }) {
      id tag slug count tag_category_id
    }
    tags_aggregate(where: $where) {
      aggregate { count }
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_tags",
    {
      title: "Get Tags",
      description:
        "Get tags, optionally filtered by category. Categories: 1=Genre, 2=General, 3=Content Warnings, 4=Mood, 37=Pace. Can also filter by book ID to see tags for a specific book.",
      inputSchema: z.object({
        category_id: z
          .number()
          .int()
          .optional()
          .describe("Tag category: 1=Genre, 2=General, 3=Content Warnings, 4=Mood, 37=Pace"),
        book_id: z
          .number()
          .int()
          .positive()
          .max(2_147_483_647)
          .optional()
          .describe("Filter tags by book ID"),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ category_id, book_id, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (category_id) where.tag_category_id = { _eq: category_id };
        if (book_id) where.taggings = { book_id: { _eq: book_id } };

        const data = await graphql<{
          tags: Array<Record<string, unknown>>;
          tags_aggregate: { aggregate: { count: number } };
        }>(GET_TAGS_QUERY, { where, limit, offset });

        const total = data.tags_aggregate.aggregate.count;
        const pagination = computePagination(total, data.tags.length, offset);

        const md =
          data.tags
            .map((t) => {
              const cat = TAG_CATEGORY_LABELS[t.tag_category_id as number] ?? "Other";
              return `- **${t.tag}** [${cat}] (${t.count} books) [ID: ${t.id}]`;
            })
            .join("\n") + formatPaginationNote(pagination);

        return formatResult(
          { tags: data.tags, pagination },
          data.tags.length ? md : "No tags found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
