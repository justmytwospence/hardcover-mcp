import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";
import { INSTRUCTIONS } from "./guidance.js";
import { formatResult } from "./format.js";
import { register as registerUsageResources } from "./resources/usage.js";
import { register as registerPageResources } from "./resources/pages.js";

import { register as registerBooks } from "./tools/books.js";
import { register as registerAuthors } from "./tools/authors.js";
import { register as registerSeries } from "./tools/series.js";
import { register as registerEditions } from "./tools/editions.js";
import { register as registerUsers } from "./tools/users.js";
import { register as registerUserBooks } from "./tools/user-books.js";
import { register as registerLists } from "./tools/lists.js";
import { register as registerSearch } from "./tools/search.js";
import { register as registerActivity } from "./tools/activity.js";
import { register as registerJournals } from "./tools/journals.js";
import { register as registerGoals } from "./tools/goals.js";
import { register as registerCharacters } from "./tools/characters.js";
import { register as registerPrompts } from "./tools/prompts.js";
import { register as registerNotifications } from "./tools/notifications.js";
import { register as registerTags } from "./tools/tags.js";
import { register as registerRateLimit, TOOL_COSTS } from "./tools/rate-limit.js";

import { register as registerProfileResource } from "./resources/profile.js";
import { register as registerShelvesResource } from "./resources/shelves.js";
import { register as registerGoalsResource } from "./resources/goals.js";
import { register as registerBooksResource } from "./resources/books.js";
import { register as registerReferenceResource } from "./resources/reference.js";

import { register as registerRecommendPrompt } from "./prompts/recommend.js";
import { register as registerReviewPrompt } from "./prompts/review.js";
import { register as registerComparePrompt } from "./prompts/compare.js";
import { register as registerTbrCleanupPrompt } from "./prompts/tbr-cleanup.js";

export const SERVER_NAME = "hardcover-mcp-server";
export const VERSION: string = createRequire(import.meta.url)("../package.json").version;

/**
 * Builds a fully registered server. The HTTP transport calls this once per request,
 * stdio once per process, so keep it free of side effects and I/O.
 */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION },
    { instructions: INSTRUCTIONS }
  );

  // Keep native registration/validation, supplementing cost and safe retry guidance.
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = (name: string, config: any, handler: any) => {
    const cost = TOOL_COSTS[name];
    if (cost !== undefined && config.description) {
      const costLabel =
        cost === 0 ? "zero network calls" : `up to ${cost} top-level GraphQL fields before retries`;
      config.description += ` [API cost: ${costLabel}]`;
      if (cost > 0)
        config.description +=
          " Check hardcover_get_rate_limit before multi-page work; every retry costs again. Honor RateLimit/RateLimit-Policy/Retry-After and cooldowns. Use bounded pages; do not fan out detail lookups.";
      if (name === "hardcover_get_user_books" || name === "hardcover_get_goals")
        config.description += " With user_id: 1 field; without: up to 2 (me + data).";
      if (name === "hardcover_search_books")
        config.description += " Empty search: 1 field; search plus batched details: 2.";
      if (!config.annotations?.readOnlyHint)
        config.description +=
          " Never automatically replay a write. On timeout/connection loss/5xx, reconcile remote state before any authorized retry. Hints are not approval gates.";
    }
    return originalRegisterTool(name, config, async (...args: any[]) => {
      const result = await handler(...args);
      if (result.structuredContent) return result;
      // Legacy not-found/validation branches retain text without claiming absent machine data.
      return { ...formatResult(null), ...result };
    });
  };

  registerBooks(server);
  registerAuthors(server);
  registerSeries(server);
  registerEditions(server);
  registerUsers(server);
  registerUserBooks(server);
  registerLists(server);
  registerSearch(server);
  registerActivity(server);
  registerJournals(server);
  registerGoals(server);
  registerCharacters(server);
  registerPrompts(server);
  registerNotifications(server);
  registerTags(server);
  registerRateLimit(server);

  registerUsageResources(server);
  registerPageResources(server);
  registerProfileResource(server);
  registerShelvesResource(server);
  registerGoalsResource(server);
  registerBooksResource(server);
  registerReferenceResource(server);

  registerRecommendPrompt(server);
  registerReviewPrompt(server);
  registerComparePrompt(server);
  registerTbrCleanupPrompt(server);

  return server;
}
