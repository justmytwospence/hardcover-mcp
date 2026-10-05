import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult, formatAuthor } from "../format.js";
import { paginationSchema } from "../pagination.js";

const GET_AUTHOR_QUERY = `
  query GetAuthor($id: Int!) {
    authors_by_pk(id: $id) {
      id name bio born_date death_date
      books_count
      contributions(limit: 20, order_by: { book: { rating: desc_nulls_last } }) {
        book { id title release_year rating }
      }
      image { url }
    }
  }
`;

const FIND_AUTHORS_QUERY = `
  query FindAuthors($where: authors_bool_exp, $limit: Int!, $offset: Int!) {
    authors(where: $where, limit: $limit, offset: $offset, order_by: { books_count: desc_nulls_last }) {
      id name books_count born_date death_date
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_author",
    {
      title: "Get Author",
      description:
        "Get detailed information about an author by ID, including biography, dates, and their top-rated books.",
      inputSchema: z.object({
        author_id: z.number().int().describe("The Hardcover author ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ author_id }) => {
      try {
        const data = await graphql<{ authors_by_pk: Record<string, unknown> }>(GET_AUTHOR_QUERY, {
          id: author_id,
        });
        if (!data.authors_by_pk) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No author found with ID ${author_id}.`,
              },
            ],
          };
        }

        const author = data.authors_by_pk;
        let md = formatAuthor(author);
        const contributions = author.contributions as
          | Array<{
              book: {
                id: number;
                title: string;
                release_year?: number;
                rating?: number;
              };
            }>
          | undefined;
        if (contributions?.length) {
          md += "## Books\n";
          for (const c of contributions) {
            const rating = c.book.rating ? ` (${c.book.rating}/5)` : "";
            md += `- ${c.book.title}${c.book.release_year ? ` (${c.book.release_year})` : ""}${rating} [ID: ${c.book.id}]\n`;
          }
        }

        return formatResult(author, md);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_find_authors",
    {
      title: "Find Authors",
      description:
        "Search for authors by name. Use hardcover_search with type 'author' for fuzzy/full-text search instead.",
      inputSchema: z.object({
        name: z.string().optional().describe("Author name (exact match)"),
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
          authors: Array<Record<string, unknown>>;
        }>(FIND_AUTHORS_QUERY, { where, limit, offset });

        const md = data.authors
          .map((a) => `- **${a.name}** (${a.books_count ?? 0} books) [ID: ${a.id}]`)
          .join("\n");

        return formatResult({ authors: data.authors }, md || "No authors found.");
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
