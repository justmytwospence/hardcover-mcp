import { McpServer } from "@modelcontextprotocol/server";
import { getRateLimitStatus } from "../client.js";
import { formatResult } from "../format.js";
import { z } from "zod";

export const TOOL_COSTS: Record<string, number> = {
  hardcover_get_book: 1,
  hardcover_find_books: 2,
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
  hardcover_find_lists: 2,
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
  hardcover_get_tags: 2,
  hardcover_get_rate_limit: 0,
};

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_rate_limit",
    {
      title: "Get Rate Limit Status",
      description:
        "Check cached/local quota without network calls: authoritative RateLimit/RateLimit-Policy snapshots with observation times, local daily/burst estimates, cooldowns and uncertainty. Account tier is unknown until headers identify it. remaining/limit compatibility fields are LOCAL burst estimates, not account-wide quota. Costs below are maximum first-attempt field costs; retries add cost. get_user_books/get_goals use 1 field with user_id, otherwise up to 2; search_books uses 1 if empty, otherwise 2. Check before multi-page/detail workflows; honor Retry-After and stop on exhaustion.",
      inputSchema: z.object({}),
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
        `**Local burst estimate:** ${status.remaining}/${status.limit} fields`,
        `**Account plan:** ${status.account_plan ?? "unknown"}`,
        `**HTTP attempts this process:** ${status.total_calls_this_session}`,
        `**Estimated daily remaining:** ${status.estimates.daily_remaining ?? "unknown"}`,
        `**Estimated next admission delay:** ${status.resets_in_seconds}s (local/header estimate)`,
        status.uncertainty,
        ``,
        `## Tool Costs`,
        ...Object.entries(TOOL_COSTS)
          .filter(([, cost]) => cost > 0)
          .map(([tool, cost]) => `- ${tool}: up to ${cost} top-level fields before retries`),
      ].join("\n");

      return formatResult({ ...status, tool_costs: TOOL_COSTS }, md);
    }
  );
}
