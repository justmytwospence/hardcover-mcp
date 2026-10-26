import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";
import { paginationSchema, computePage } from "../pagination.js";

const GET_CHARACTERS_QUERY = `
  query GetCharacters($where: characters_bool_exp, $limit: Int!, $offset: Int!) {
    characters(where: $where, limit: $limit, offset: $offset, order_by: { books_count: desc_nulls_last }) {
      id name biography books_count
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_characters",
    {
      title: "Get Characters",
      description:
        "Get fictional characters, optionally filtered by book. Returns character name, biography, and book count.",
      inputSchema: z.object({
        book_id: z
          .number()
          .int()
          .positive()
          .max(2_147_483_647)
          .optional()
          .describe("Filter characters by book ID"),
        name: z.string().optional().describe("Filter by character name (exact match)"),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ book_id, name, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (book_id) where.book_characters = { book_id: { _eq: book_id } };
        if (name) where.name = { _eq: name };

        const data = await graphql<{
          characters: Array<Record<string, unknown>>;
        }>(GET_CHARACTERS_QUERY, { where, limit, offset });

        const md = data.characters
          .map((c) => {
            const bio = c.biography
              ? ` — ${String(c.biography).slice(0, 100)}${String(c.biography).length > 100 ? "..." : ""}`
              : "";
            return `- **${c.name}** (${c.books_count ?? 0} books)${bio} [ID: ${c.id}]`;
          })
          .join("\n");

        return formatResult(
          {
            characters: data.characters,
            pagination: computePage(data.characters.length, limit, offset),
          },
          data.characters.length ? md : "No characters found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
