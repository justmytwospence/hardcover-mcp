import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { graphql } from "../client.js";
import { CHARACTER_LIMIT } from "../format.js";
import { GET_USER_BOOKS_QUERY } from "../tools/user-books.js";

export function uriInteger(
  value: string | string[] | undefined,
  name: string,
  min = 1,
  max = 2_147_483_647
): number {
  if (typeof value !== "string" || !/^\d+$/.test(value))
    throw new Error(`Invalid ${name}: expected an integer from ${min} to ${max}.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error(`Invalid ${name}: expected an integer from ${min} to ${max}.`);
  return n;
}

const LIST_PAGE_QUERY = `
  query ListPage($id: Int!, $limit: Int!, $offset: Int!) {
    lists_by_pk(id: $id) {
      id name description books_count privacy_setting_id
      user { id username }
      list_books(order_by: [{ position: asc_nulls_last }, { id: asc }], limit: $limit, offset: $offset) {
        id position date_added book { id title rating contributions { author { id name } } }
      }
    }
  }
`;

/** Keep valid JSON and whole rows under the resource text budget; advance only over delivered rows. */
export function pageContent(
  uri: URL,
  key: string,
  rows: unknown[],
  limit: number,
  offset: number,
  context: Record<string, unknown> = {}
) {
  const selected = [...rows];
  const build = () => ({
    source: "Hardcover API",
    api_field_cost: 1,
    ...context,
    [key]: selected,
    pagination: {
      limit,
      offset,
      count: selected.length,
      has_more: selected.length < rows.length ? true : rows.length === limit ? "unknown" : false,
      next_offset:
        selected.length > 0 && (rows.length === limit || selected.length < rows.length)
          ? offset + selected.length
          : null,
      truncated: selected.length < rows.length,
    },
  });
  let text = JSON.stringify(build());
  while (text.length > CHARACTER_LIMIT && selected.length) {
    selected.pop();
    text = JSON.stringify(build());
  }
  if (text.length > CHARACTER_LIMIT || (rows.length > 0 && selected.length === 0)) {
    // No progress is possible: do not silently skip an oversized first row/context.
    text = JSON.stringify({
      source: "Hardcover API",
      error:
        "Resource page exceeds 25000 characters. Use the corresponding tool for the machine payload; this page is incomplete.",
      pagination: { offset, count: 0, truncated: true, next_offset: null },
    });
  }
  return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
}

export function register(server: McpServer): void {
  server.registerResource(
    "shelf-page",
    new ResourceTemplate("hardcover://shelves/{user_id}/{status_id}/{limit}/{offset}", {
      list: undefined,
    }),
    {
      title: "Paginated User Shelf",
      description:
        "One API field per read before retries. Read one authorized user's shelf, status 1-6, limit 1-100, offset >=0. No profile lookup. Full pages only indicate more may exist. Same privacy/scopes as tools.",
      mimeType: "application/json",
    },
    async (uri, args) => {
      const userId = uriInteger(args.user_id, "user_id");
      const statusId = uriInteger(args.status_id, "status_id", 1, 6);
      const limit = uriInteger(args.limit, "limit", 1, 100);
      const offset = uriInteger(args.offset, "offset", 0);
      const data = await graphql<{ user_books: Record<string, unknown>[] }>(GET_USER_BOOKS_QUERY, {
        where: { user_id: { _eq: userId }, status_id: { _eq: statusId } },
        limit,
        offset,
        order_by: [{ date_added: "desc" }, { id: "asc" }],
      });
      return pageContent(uri, "user_books", data.user_books, limit, offset, {
        user_id: userId,
        status_id: statusId,
      });
    }
  );
  server.registerResource(
    "list-page",
    new ResourceTemplate("hardcover://lists/{list_id}/{limit}/{offset}", { list: undefined }),
    {
      title: "Paginated List Books",
      description:
        "One API field per read before retries. List metadata and one book page; limit 1-100, offset >=0. No writes/profile lookup. Inaccessible/missing lists return not found. books_count may differ from accessible rows; full page is not proof of more.",
      mimeType: "application/json",
    },
    async (uri, args) => {
      const id = uriInteger(args.list_id, "list_id");
      const limit = uriInteger(args.limit, "limit", 1, 100);
      const offset = uriInteger(args.offset, "offset", 0);
      const data = await graphql<{
        lists_by_pk: (Record<string, unknown> & { list_books: unknown[] }) | null;
      }>(LIST_PAGE_QUERY, { id, limit, offset });
      if (!data.lists_by_pk)
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                source: "Hardcover API",
                list: null,
                message: "List not found or inaccessible.",
              }),
            },
          ],
        };
      const { list_books, ...list } = data.lists_by_pk;
      return pageContent(uri, "list_books", list_books, limit, offset, { list });
    }
  );
}
