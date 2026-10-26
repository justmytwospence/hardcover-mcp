import { McpServer } from "@modelcontextprotocol/server";
import { graphql } from "../client.js";
import { formatUserBook, boundText } from "../format.js";
import { GET_USER_BOOKS_QUERY } from "../tools/user-books.js";
import { USER_BOOK_STATUS } from "../types.js";

async function fetchShelf(statusId: number, limit: number): Promise<string> {
  const meData = await graphql<{ me: Array<{ id: number }> }>(`
    query {
      me {
        id
      }
    }
  `);
  const myId = meData.me?.[0]?.id;
  if (!myId) return "Could not determine user ID.";

  const data = await graphql<{
    user_books: Array<Record<string, unknown>>;
  }>(GET_USER_BOOKS_QUERY, {
    where: { user_id: { _eq: myId }, status_id: { _eq: statusId } },
    limit,
    offset: 0,
    order_by: [{ date_added: "desc" }],
  });

  if (!data.user_books.length) return "No books found.";
  return boundText(
    data.user_books.map(formatUserBook).join("\n") +
      `\n\nFirst page, at most ${limit} books; ${data.user_books.length === limit ? "more may exist" : "no more indicated"}. For continuation use hardcover://shelves/${myId}/${statusId}/20/${data.user_books.length}. Each template read costs one field.`
  );
}

export function register(server: McpServer): void {
  server.registerResource(
    "currently-reading",
    "hardcover://currently-reading",
    {
      description:
        "Up to two API fields per read before retries (me + shelf). First 50 currently-reading books, text capped at 25000 characters. Use shelf-page template for bounded continuation.",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: await fetchShelf(USER_BOOK_STATUS.CURRENTLY_READING, 50),
          mimeType: "text/plain",
        },
      ],
    })
  );

  server.registerResource(
    "want-to-read",
    "hardcover://want-to-read",
    {
      description:
        "Up to two API fields per read before retries (me + shelf). First 50 TBR books, text capped at 25000 characters. Use shelf-page template for bounded continuation.",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: await fetchShelf(USER_BOOK_STATUS.WANT_TO_READ, 50),
          mimeType: "text/plain",
        },
      ],
    })
  );
}
