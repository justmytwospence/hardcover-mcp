#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

const server = new McpServer({
  name: "hardcover-mcp-server",
  version: "1.0.0",
});

// Wrap registerTool to append API cost to each tool's description
const originalRegisterTool = server.registerTool.bind(server);
server.registerTool = (name: string, config: any, handler: any) => {
  const cost = TOOL_COSTS[name];
  if (cost !== undefined && config.description) {
    const costLabel = cost === 0 ? "no API calls" : `${cost} API call${cost > 1 ? "s" : ""}`;
    config.description += ` [API cost: ${costLabel}]`;
  }
  return originalRegisterTool(name, config, handler);
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

async function main() {
  if (!process.env.HARDCOVER_API_KEY) {
    console.error(
      "ERROR: HARDCOVER_API_KEY environment variable is required.\n" +
        "Get your API key from your Hardcover account settings."
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hardcover MCP server running via stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
