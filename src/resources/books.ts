import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { graphql } from "../client.js";
import { formatBook } from "../format.js";
import { GET_BOOK_QUERY } from "../tools/books.js";

export function register(server: McpServer): void {
  server.registerResource(
    "book",
    new ResourceTemplate("hardcover://books/{book_id}", { list: undefined }),
    {
      description: "Detailed information about a specific book by Hardcover ID.",
      mimeType: "text/plain",
    },
    async (uri, variables) => {
      const bookId = parseInt(String(variables.book_id), 10);
      if (isNaN(bookId)) {
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
        contents: [{ uri: uri.href, text, mimeType: "text/plain" }],
      };
    }
  );
}
