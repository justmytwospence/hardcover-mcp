import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { graphql } from "../client.js";
import { formatBook, boundText } from "../format.js";
import { uriInteger } from "./pages.js";
import { GET_BOOK_QUERY } from "../tools/books.js";

export function register(server: McpServer): void {
  server.registerResource(
    "book",
    new ResourceTemplate("hardcover://books/{book_id}", { list: undefined }),
    {
      description:
        "One API field per read before retries. Detailed book information by positive integer ID, with bounded nested selections. Text capped at 25000 characters; use hardcover_get_book for machine data.",
      mimeType: "text/plain",
    },
    async (uri, variables) => {
      let bookId: number;
      try {
        bookId = uriInteger(variables.book_id, "book_id");
      } catch {
        return {
          contents: [{ uri: uri.href, text: "Invalid book ID.", mimeType: "text/plain" }],
        };
      }

      const data = await graphql<{
        books_by_pk: Record<string, unknown> | null;
      }>(GET_BOOK_QUERY, { id: bookId });

      const text = data.books_by_pk
        ? formatBook(data.books_by_pk)
        : `Book with ID ${bookId} not found.`;

      return {
        contents: [{ uri: uri.href, text: boundText(text), mimeType: "text/plain" }],
      };
    }
  );
}
