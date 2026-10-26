import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult, formatBook, formatBookSummary } from "../format.js";
import { paginationSchema, computePagination, formatPaginationNote } from "../pagination.js";

export const GET_BOOK_QUERY = `
  query GetBook($id: Int!) {
    books_by_pk(id: $id) {
      id title subtitle slug description pages
      release_date release_year rating ratings_count
      reviews_count users_read_count users_count
      audio_seconds cached_image
      contributions(limit: 20) { author { id name } }
      taggings(limit: 30) { tag { id tag tag_category_id } tag_id }
      book_series(limit: 20) { series { id name } position }
      editions(limit: 5) { id title isbn_13 isbn_10 asin pages edition_format }
      image { url }
    }
  }
`;

const FIND_BOOKS_QUERY = `
  query FindBooks($where: books_bool_exp, $limit: Int!, $offset: Int!, $order_by: [books_order_by!]) {
    books(where: $where, limit: $limit, offset: $offset, order_by: $order_by) {
      id title release_year rating ratings_count pages
      contributions { author { id name } }
      taggings(limit: 10) { tag { id tag tag_category_id } }
    }
    books_aggregate(where: $where) {
      aggregate { count }
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_book",
    {
      title: "Get Book",
      description:
        "Get detailed information about a book by its Hardcover ID. Returns title, description, pages, rating, and up to 20 authors/contributions, 30 tags, 20 series and 5 editions. Nested collections may be incomplete.",
      inputSchema: z.object({
        book_id: z.number().int().positive().max(2_147_483_647).describe("The Hardcover book ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ book_id }) => {
      try {
        const data = await graphql<{ books_by_pk: Record<string, unknown> }>(GET_BOOK_QUERY, {
          id: book_id,
        });
        if (!data.books_by_pk) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No book found with ID ${book_id}.`,
              },
            ],
          };
        }
        return formatResult(data.books_by_pk, formatBook(data.books_by_pk));
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_find_books",
    {
      title: "Find Books",
      description:
        "Query books with filters. Filter by title, author name, release year range, or minimum rating. Results are ordered by rating by default.",
      inputSchema: z.object({
        title: z.string().optional().describe("Filter by title (exact match via _eq)"),
        author_name: z.string().optional().describe("Filter by author name"),
        min_year: z.number().int().optional().describe("Minimum release year"),
        max_year: z.number().int().optional().describe("Maximum release year"),
        min_rating: z.number().min(0).max(5).optional().describe("Minimum rating (0-5)"),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ title, author_name, min_year, max_year, min_rating, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (title) where.title = { _eq: title };
        if (author_name) {
          where.contributions = { author: { name: { _eq: author_name } } };
        }
        if (min_year || max_year) {
          where.release_year = {};
          if (min_year) (where.release_year as Record<string, unknown>)._gte = min_year;
          if (max_year) (where.release_year as Record<string, unknown>)._lte = max_year;
        }
        if (min_rating) where.rating = { _gte: min_rating };

        const data = await graphql<{
          books: Array<Record<string, unknown>>;
          books_aggregate: { aggregate: { count: number } };
        }>(FIND_BOOKS_QUERY, {
          where,
          limit,
          offset,
          order_by: [{ rating: "desc_nulls_last" }],
        });

        const total = data.books_aggregate.aggregate.count;
        const pagination = computePagination(total, data.books.length, offset);
        const md = data.books.map(formatBookSummary).join("\n") + formatPaginationNote(pagination);

        return formatResult(
          { books: data.books, pagination },
          md || "No books found matching the filters."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_search_books",
    {
      title: "Search Books",
      description:
        "Full-text search for books using Hardcover's Typesense search engine. Better than find_books for natural language queries like 'fantasy dragons' or 'mystery thriller'.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search query text"),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Results per page (1-50, default 20)"),
        page: z.number().int().min(1).default(1).describe("Page number (default 1)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, per_page, page }) => {
      try {
        const searchQuery = `
          query SearchBooks($query: String!, $per_page: Int!, $page: Int!) {
            search(query: $query, query_type: "Book", per_page: $per_page, page: $page) {
              ids
              results
            }
          }
        `;
        const data = await graphql<{
          search: { ids: number[]; results: unknown };
        }>(searchQuery, { query, per_page, page });

        if (!data.search.ids?.length) {
          return {
            content: [{ type: "text" as const, text: `No books found for "${query}".` }],
          };
        }

        // Fetch full book data for the IDs
        const booksQuery = `
          query GetBooks($ids: [Int!]!) {
            books(where: { id: { _in: $ids } }, limit: 50) {
              id title release_year rating ratings_count pages
              contributions { author { id name } }
            }
          }
        `;
        const booksData = await graphql<{
          books: Array<Record<string, unknown>>;
        }>(booksQuery, { ids: data.search.ids });

        // Sort by original search order
        const idOrder = new Map(data.search.ids.map((id, i) => [id, i]));
        const sorted = [...booksData.books].sort(
          (a, b) => (idOrder.get(a.id as number) ?? 0) - (idOrder.get(b.id as number) ?? 0)
        );

        const md = sorted.map(formatBookSummary).join("\n");
        return formatResult({ books: sorted, search_ids: data.search.ids }, md);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
