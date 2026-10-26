import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult, formatSeries } from "../format.js";
import { paginationSchema, computePage } from "../pagination.js";

const GET_SERIES_QUERY = `
  query GetSeries($id: Int!) {
    series_by_pk(id: $id) {
      id name description books_count primary_books_count is_completed
      book_series(order_by: { position: asc_nulls_last }, limit: 100) {
        position
        book { id title rating release_year }
      }
    }
  }
`;

const FIND_SERIES_QUERY = `
  query FindSeries($where: series_bool_exp, $limit: Int!, $offset: Int!) {
    series(where: $where, limit: $limit, offset: $offset, order_by: { books_count: desc_nulls_last }) {
      id name books_count primary_books_count is_completed
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_series",
    {
      title: "Get Series",
      description:
        "Get a book series by ID, including up to 100 books in order with their positions (may be incomplete).",
      inputSchema: z.object({
        series_id: z
          .number()
          .int()
          .positive()
          .max(2_147_483_647)
          .describe("The Hardcover series ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ series_id }) => {
      try {
        const data = await graphql<{ series_by_pk: Record<string, unknown> }>(GET_SERIES_QUERY, {
          id: series_id,
        });
        if (!data.series_by_pk) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No series found with ID ${series_id}.`,
              },
            ],
          };
        }
        return formatResult(data.series_by_pk, formatSeries(data.series_by_pk));
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_find_series",
    {
      title: "Find Series",
      description:
        "Search for book series by name. Use hardcover_search with type 'Series' for fuzzy/full-text search.",
      inputSchema: z.object({
        name: z.string().optional().describe("Series name (exact match)"),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ name, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (name) where.name = { _eq: name };

        const data = await graphql<{
          series: Array<Record<string, unknown>>;
        }>(FIND_SERIES_QUERY, { where, limit, offset });

        const md = data.series
          .map(
            (s) =>
              `- **${s.name}** (${s.books_count} books${s.is_completed ? ", completed" : ""}) [ID: ${s.id}]`
          )
          .join("\n");

        return formatResult(
          { series: data.series, pagination: computePage(data.series.length, limit, offset) },
          md || "No series found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
