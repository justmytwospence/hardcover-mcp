import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRateLimitStatus } from "../client.js";
import { formatResult } from "../format.js";

export const TOOL_COSTS: Record<string, number> = {
  hardcover_get_book: 1,
  hardcover_find_books: 1,
  hardcover_search_books: 2,
  hardcover_get_author: 1,
  hardcover_find_authors: 1,
  hardcover_get_series: 1,
  hardcover_find_series: 1,
  hardcover_find_editions: 1,
  hardcover_get_me: 1,
  hardcover_get_user: 1,
  hardcover_get_user_books: 2,
  hardcover_add_user_book: 1,
  hardcover_update_user_book: 1,
  hardcover_remove_user_book: 1,
  hardcover_get_list: 1,
  hardcover_find_lists: 1,
  hardcover_create_list: 1,
  hardcover_update_list: 1,
  hardcover_delete_list: 1,
  hardcover_add_list_book: 1,
  hardcover_remove_list_book: 1,
  hardcover_follow_list: 1,
  hardcover_unfollow_list: 1,
  hardcover_search: 1,
  hardcover_get_activity: 1,
  hardcover_get_journals: 1,
  hardcover_get_goals: 2,
  hardcover_get_characters: 1,
  hardcover_get_prompts: 1,
  hardcover_get_notifications: 1,
  hardcover_get_tags: 1,
  hardcover_get_rate_limit: 0,
};

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_rate_limit",
    {
      title: "Get Rate Limit Status",
      description: `Check current API rate limit status. Returns remaining calls, total used this session, and reset timer.

The Hardcover API allows 60 requests per minute. Each tool has an API cost:
- Cost 0: hardcover_get_rate_limit (no API call)
- Cost 1: Most tools (get_book, find_books, get_author, find_authors, get_series, find_series, find_editions, get_me, get_user, add_user_book, update_user_book, remove_user_book, get_list, find_lists, create_list, update_list, delete_list, add_list_book, remove_list_book, follow_list, unfollow_list, search, get_activity, get_journals, get_characters, get_prompts, get_notifications, get_tags)
- Cost 2: search_books (search + fetch details), get_user_books (may fetch user ID), get_goals (may fetch user ID)

Call this tool to check remaining budget before making many requests.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const status = getRateLimitStatus();
      const md = [
        `## API Rate Limit`,
        `**Remaining:** ${status.remaining}/${status.limit} requests`,
        `**Used this session:** ${status.total_calls_this_session}`,
        `**Window resets in:** ${status.resets_in_seconds}s`,
        ``,
        `## Tool Costs`,
        ...Object.entries(TOOL_COSTS)
          .filter(([, cost]) => cost > 0)
          .map(([tool, cost]) => `- ${tool}: ${cost} API call${cost > 1 ? "s" : ""}`),
      ].join("\n");

      return formatResult({ ...status, tool_costs: TOOL_COSTS }, md);
    }
  );
}
