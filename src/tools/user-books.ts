import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult, formatUserBook } from "../format.js";
import { paginationSchema } from "../pagination.js";
import { USER_BOOK_STATUS_LABELS } from "../types.js";

export const GET_USER_BOOKS_QUERY = `
  query GetUserBooks($where: user_books_bool_exp, $limit: Int!, $offset: Int!, $order_by: [user_books_order_by!]) {
    user_books(where: $where, limit: $limit, offset: $offset, order_by: $order_by) {
      id status_id rating review_raw owned owned_copies
      date_added first_read_date last_read_date read_count
      edition_id privacy_setting_id
      book {
        id title release_year rating
        contributions { author { id name } }
      }
    }
  }
`;

const INSERT_USER_BOOK_MUTATION = `
  mutation InsertUserBook($object: UserBookCreateInput!) {
    insert_user_book(object: $object) {
      id error
      user_book { id status_id rating book { id title } }
    }
  }
`;

const UPDATE_USER_BOOK_MUTATION = `
  mutation UpdateUserBook($id: Int!, $object: UserBookUpdateInput!) {
    update_user_book(id: $id, object: $object) {
      id error
      user_book { id status_id rating review_raw book { id title } }
    }
  }
`;

const REMOVE_USER_BOOK_MUTATION = `
  mutation RemoveUserBook($id: Int!) {
    delete_user_book(id: $id) {
      id book_id
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_user_books",
    {
      title: "Get User Books",
      description: `Get books from a user's library. Filter by status: 1=Want to Read, 2=Currently Reading, 3=Read, 4=Paused, 5=Did Not Finish, 6=Ignored. If no user_id provided, returns the authenticated user's library.`,
      inputSchema: z.object({
        user_id: z.number().int().optional().describe("User ID (defaults to authenticated user)"),
        status_id: z
          .number()
          .int()
          .min(1)
          .max(6)
          .optional()
          .describe(
            "Filter by status: 1=Want to Read, 2=Reading, 3=Read, 4=Paused, 5=DNF, 6=Ignored"
          ),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ user_id, status_id, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (user_id) {
          where.user_id = { _eq: user_id };
        } else {
          // Get authenticated user's ID
          const meData = await graphql<{ me: Array<{ id: number }> }>(`
            query {
              me {
                id
              }
            }
          `);
          const myId = meData.me?.[0]?.id;
          if (!myId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Could not determine your user ID.",
                },
              ],
              isError: true,
            };
          }
          where.user_id = { _eq: myId };
        }
        if (status_id) where.status_id = { _eq: status_id };

        const data = await graphql<{
          user_books: Array<Record<string, unknown>>;
        }>(GET_USER_BOOKS_QUERY, {
          where,
          limit,
          offset,
          order_by: [{ date_added: "desc" }],
        });

        const statusLabel = status_id ? USER_BOOK_STATUS_LABELS[status_id] : "All";
        const md = `## ${statusLabel} Books\n\n` + data.user_books.map(formatUserBook).join("\n");

        return formatResult(
          { user_books: data.user_books },
          data.user_books.length ? md : "No books found with the given filters."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_add_user_book",
    {
      title: "Add Book to Library",
      description:
        "Add a book to your library with a reading status. Status: 1=Want to Read, 2=Currently Reading, 3=Read, 4=Paused, 5=Did Not Finish, 6=Ignored.",
      inputSchema: z.object({
        book_id: z.number().int().describe("The Hardcover book ID to add"),
        status_id: z
          .number()
          .int()
          .min(1)
          .max(6)
          .describe("Status: 1=Want to Read, 2=Reading, 3=Read, 4=Paused, 5=DNF, 6=Ignored"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ book_id, status_id }) => {
      try {
        const data = await graphql<{
          insert_user_book: Record<string, unknown>;
        }>(INSERT_USER_BOOK_MUTATION, {
          object: { book_id, status_id },
        });

        const result = data.insert_user_book;
        if (result.error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            isError: true,
          };
        }
        const ub = result.user_book as Record<string, unknown>;
        const book = ub?.book as Record<string, unknown>;
        const status = USER_BOOK_STATUS_LABELS[status_id];
        return formatResult(
          ub,
          `Added **${book?.title}** as "${status}". [User Book ID: ${result.id}]`
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_update_user_book",
    {
      title: "Update User Book",
      description:
        "Update a book in your library. Change status, rating (0-5, supports halves like 3.5), or review text. Use hardcover_get_user_books to find the user_book_id first.",
      inputSchema: z.object({
        user_book_id: z.number().int().describe("The user book ID (from hardcover_get_user_books)"),
        status_id: z
          .number()
          .int()
          .min(1)
          .max(6)
          .optional()
          .describe("New status: 1=Want to Read, 2=Reading, 3=Read, 4=Paused, 5=DNF, 6=Ignored"),
        rating: z
          .number()
          .min(0)
          .max(5)
          .optional()
          .describe("Rating from 0-5 (supports halves like 3.5, 0 to clear)"),
        review: z.string().optional().describe("Review text"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ user_book_id, status_id, rating, review }) => {
      try {
        const object: Record<string, unknown> = {};
        if (status_id !== undefined) object.status_id = status_id;
        if (rating !== undefined) object.rating = rating;
        if (review !== undefined) object.review_raw = review;

        if (Object.keys(object).length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Provide at least one field to update (status_id, rating, or review).",
              },
            ],
            isError: true,
          };
        }

        const data = await graphql<{
          update_user_book: Record<string, unknown>;
        }>(UPDATE_USER_BOOK_MUTATION, { id: user_book_id, object });

        const result = data.update_user_book;
        if (result.error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            isError: true,
          };
        }
        const ub = result.user_book as Record<string, unknown>;
        const book = ub?.book as Record<string, unknown>;
        const parts: string[] = [`Updated **${book?.title}**:`];
        if (status_id !== undefined) parts.push(`Status: ${USER_BOOK_STATUS_LABELS[status_id]}`);
        if (rating !== undefined) parts.push(`Rating: ${rating}/5`);
        if (review !== undefined) parts.push(`Review updated`);

        return formatResult(ub, parts.join(" | "));
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_remove_user_book",
    {
      title: "Remove Book from Library",
      description:
        "Remove a book from your library. This is irreversible. Use hardcover_get_user_books to find the user_book_id.",
      inputSchema: z.object({
        user_book_id: z.number().int().describe("The user book ID to remove"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ user_book_id }) => {
      try {
        await graphql<{ delete_user_book: { id: number } }>(REMOVE_USER_BOOK_MUTATION, {
          id: user_book_id,
        });
        return formatResult(
          { deleted: user_book_id },
          `Removed user book ${user_book_id} from your library.`
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
