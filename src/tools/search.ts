import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";

const SEARCH_QUERY = `
  query Search($query: String!, $query_type: String!, $per_page: Int!, $page: Int!) {
    search(query: $query, query_type: $query_type, per_page: $per_page, page: $page) {
      ids
      results
    }
  }
`;

const SEARCH_TYPES = [
  "Book",
  "Author",
  "Character",
  "List",
  "Prompt",
  "Publisher",
  "Series",
  "User",
] as const;

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_search",
    {
      title: "Search Hardcover",
      description:
        "Universal full-text search across Hardcover using Typesense. Search for books, authors, characters, lists, prompts, publishers, series, or users. Returns matching IDs and search results. For detailed data, follow up with the appropriate get tool (e.g., hardcover_get_book).",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search query text"),
        type: z
          .enum(SEARCH_TYPES)
          .default("Book")
          .describe(
            "Entity type to search: Book, Author, Character, List, Prompt, Publisher, Series, or User"
          ),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Results per page (1-50, default 10)"),
        page: z.number().int().min(1).default(1).describe("Page number (default 1)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, type, per_page, page }) => {
      try {
        const data = await graphql<{
          search: { ids: number[]; results: unknown };
        }>(SEARCH_QUERY, {
          query,
          query_type: type,
          per_page,
          page,
        });

        if (!data.search.ids?.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No ${type.toLowerCase()}s found for "${query}".`,
              },
            ],
          };
        }

        const results = data.search.results as
          { hits?: Array<{ document?: Record<string, unknown> }> } | undefined;

        let md = `## Search Results for "${query}" (${type})\n\n`;
        if (results?.hits) {
          for (const hit of results.hits) {
            const doc = hit.document;
            if (!doc) continue;
            const name = doc.title ?? doc.name ?? doc.username ?? "Unknown";
            const id = doc.id ?? "";
            md += `- **${name}** [ID: ${id}]\n`;
          }
        } else {
          md += `Found ${data.search.ids.length} result(s). IDs: ${data.search.ids.join(", ")}\n`;
        }

        return formatResult({ ids: data.search.ids, results: data.search.results }, md);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
