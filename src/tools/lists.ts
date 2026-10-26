import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult, formatList } from "../format.js";
import { paginationSchema, computePagination, formatPaginationNote } from "../pagination.js";

const GET_LIST_QUERY = `
  query GetList($id: Int!) {
    lists_by_pk(id: $id) {
      id name description books_count likes_count followers_count
      ranked public privacy_setting_id
      user { id username }
      list_books(order_by: [{ position: asc_nulls_last }, { id: asc }], limit: 50) {
        id position date_added
        book { id title rating release_year
          contributions { author { name } }
        }
      }
    }
  }
`;

const FIND_LISTS_QUERY = `
  query FindLists($where: lists_bool_exp, $limit: Int!, $offset: Int!) {
    lists(where: $where, limit: $limit, offset: $offset, order_by: { books_count: desc_nulls_last }) {
      id name description books_count likes_count followers_count
      public privacy_setting_id
      user { id username }
    }
    lists_aggregate(where: $where) {
      aggregate { count }
    }
  }
`;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_list",
    {
      title: "Get List",
      description:
        "Get a list by ID with its first 50 books (not a complete list). Use hardcover://lists/{list_id}/{limit}/{offset} for subsequent bounded pages.",
      inputSchema: z.object({
        list_id: z.number().int().positive().max(2_147_483_647).describe("The Hardcover list ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ list_id }) => {
      try {
        const data = await graphql<{ lists_by_pk: Record<string, unknown> }>(GET_LIST_QUERY, {
          id: list_id,
        });
        if (!data.lists_by_pk) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No list found with ID ${list_id}.`,
              },
            ],
          };
        }
        return formatResult(data.lists_by_pk, formatList(data.lists_by_pk));
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_find_lists",
    {
      title: "Find Lists",
      description: "Search for lists. Optionally filter by user ID or public visibility.",
      inputSchema: z.object({
        user_id: z
          .number()
          .int()
          .positive()
          .max(2_147_483_647)
          .optional()
          .describe("Filter by list owner's user ID"),
        public_only: z.boolean().default(false).describe("Only show public lists"),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ user_id, public_only, limit, offset }) => {
      try {
        const where: Record<string, unknown> = {};
        if (user_id) where.user_id = { _eq: user_id };
        if (public_only) where.public = { _eq: true };

        const data = await graphql<{
          lists: Array<Record<string, unknown>>;
          lists_aggregate: { aggregate: { count: number } };
        }>(FIND_LISTS_QUERY, { where, limit, offset });

        const total = data.lists_aggregate.aggregate.count;
        const pagination = computePagination(total, data.lists.length, offset);
        const md =
          data.lists
            .map((l) => {
              const user = l.user as Record<string, unknown> | undefined;
              return `- **${l.name}** by @${user?.username ?? "unknown"} (${l.books_count} books) [ID: ${l.id}]`;
            })
            .join("\n") + formatPaginationNote(pagination);

        return formatResult(
          { lists: data.lists, pagination },
          data.lists.length ? md : "No lists found."
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_create_list",
    {
      title: "Create List",
      description:
        "Create a new list. Privacy: 1=Public, 2=Followers only, 3=Private (default: Public).",
      inputSchema: z.object({
        name: z.string().min(1).describe("List name"),
        description: z.string().optional().describe("List description"),
        privacy_setting_id: z
          .number()
          .int()
          .min(1)
          .max(3)
          .default(1)
          .describe("Privacy: 1=Public, 2=Followers, 3=Private"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ name, description, privacy_setting_id }) => {
      try {
        const mutation = `
          mutation CreateList($object: ListInput!) {
            insert_list(object: $object) {
              id errors
              list { id name description privacy_setting_id }
            }
          }
        `;
        const data = await graphql<{ insert_list: Record<string, unknown> }>(mutation, {
          object: {
            name,
            ...(description ? { description } : {}),
            privacy_setting_id,
          },
        });
        const result = data.insert_list;
        const errors = result.errors as string[] | undefined;
        if (errors?.length) {
          return {
            content: [{ type: "text" as const, text: `Error: ${errors.join(", ")}` }],
            isError: true,
          };
        }
        return formatResult(result.list, `Created list **${name}** [ID: ${result.id}]`);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_update_list",
    {
      title: "Update List",
      description: "Update a list's name, description, or privacy setting. You must own the list.",
      inputSchema: z.object({
        list_id: z.number().int().positive().max(2_147_483_647).describe("The list ID to update"),
        name: z.string().optional().describe("New list name"),
        description: z.string().optional().describe("New description"),
        privacy_setting_id: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe("Privacy: 1=Public, 2=Followers, 3=Private"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ list_id, name, description, privacy_setting_id }) => {
      try {
        const object: Record<string, unknown> = {};
        if (name !== undefined) object.name = name;
        if (description !== undefined) object.description = description;
        if (privacy_setting_id !== undefined) object.privacy_setting_id = privacy_setting_id;

        if (Object.keys(object).length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Provide at least one field to update.",
              },
            ],
            isError: true,
          };
        }

        const mutation = `
          mutation UpdateList($id: Int!, $object: ListInput!) {
            update_list(id: $id, object: $object) {
              id errors
              list { id name description privacy_setting_id }
            }
          }
        `;
        const data = await graphql<{ update_list: Record<string, unknown> }>(mutation, {
          id: list_id,
          object,
        });
        const result = data.update_list;
        const errors = result.errors as string[] | undefined;
        if (errors?.length) {
          return {
            content: [{ type: "text" as const, text: `Error: ${errors.join(", ")}` }],
            isError: true,
          };
        }
        const list = result.list as Record<string, unknown>;
        return formatResult(list, `Updated list **${list?.name}** [ID: ${list_id}]`);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_delete_list",
    {
      title: "Delete List",
      description: "Permanently delete a list. This is irreversible. You must own the list.",
      inputSchema: z.object({
        list_id: z.number().int().positive().max(2_147_483_647).describe("The list ID to delete"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ list_id }) => {
      try {
        const mutation = `
          mutation DeleteList($id: Int!) {
            delete_list(id: $id) { success }
          }
        `;
        await graphql<{ delete_list: { success: boolean } }>(mutation, {
          id: list_id,
        });
        return formatResult({ deleted: list_id }, `Deleted list ${list_id}.`);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_add_list_book",
    {
      title: "Add Book to List",
      description: "Add a book to a list at an optional position.",
      inputSchema: z.object({
        list_id: z.number().int().positive().max(2_147_483_647).describe("The list ID"),
        book_id: z.number().int().positive().max(2_147_483_647).describe("The book ID to add"),
        position: z.number().int().optional().describe("Position in the list (optional)"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ list_id, book_id, position }) => {
      try {
        const mutation = `
          mutation InsertListBook($object: ListBookInput!) {
            insert_list_book(object: $object) {
              id
              list_book { id list_id book_id position book { id title } }
            }
          }
        `;
        const object: Record<string, unknown> = { list_id, book_id };
        if (position !== undefined) object.position = position;

        const data = await graphql<{
          insert_list_book: Record<string, unknown>;
        }>(mutation, { object });
        const result = data.insert_list_book;
        const lb = result.list_book as Record<string, unknown>;
        const book = lb?.book as Record<string, unknown>;
        return formatResult(
          lb,
          `Added **${book?.title}** to list ${list_id} [List Book ID: ${result.id}]`
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_remove_list_book",
    {
      title: "Remove Book from List",
      description:
        "Remove a book from a list. Use hardcover_get_list to find the list_book_id first.",
      inputSchema: z.object({
        list_book_id: z
          .number()
          .int()
          .positive()
          .max(2_147_483_647)
          .describe("The list book ID (from hardcover_get_list)"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ list_book_id }) => {
      try {
        const mutation = `
          mutation DeleteListBook($id: Int!) {
            delete_list_book(id: $id) { id list_id }
          }
        `;
        await graphql<{ delete_list_book: { id: number; list_id: number } }>(mutation, {
          id: list_book_id,
        });
        return formatResult(
          { deleted: list_book_id },
          `Removed list book ${list_book_id} from list.`
        );
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_follow_list",
    {
      title: "Follow List",
      description: "Follow a list to see updates.",
      inputSchema: z.object({
        list_id: z.number().int().positive().max(2_147_483_647).describe("The list ID to follow"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ list_id }) => {
      try {
        const mutation = `
          mutation FollowList($list_id: Int!) {
            upsert_followed_list(list_id: $list_id) { id errors }
          }
        `;
        await graphql<{
          upsert_followed_list: { id: number; errors: string[] | null };
        }>(mutation, { list_id });
        return formatResult({ followed: list_id }, `Now following list ${list_id}.`);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_unfollow_list",
    {
      title: "Unfollow List",
      description: "Stop following a list.",
      inputSchema: z.object({
        list_id: z.number().int().positive().max(2_147_483_647).describe("The list ID to unfollow"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ list_id }) => {
      try {
        const mutation = `
          mutation UnfollowList($list_id: Int!) {
            delete_followed_list(list_id: $list_id) { success }
          }
        `;
        await graphql<{ delete_followed_list: { success: boolean } }>(mutation, { list_id });
        return formatResult({ unfollowed: list_id }, `Unfollowed list ${list_id}.`);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
