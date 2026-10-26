import { McpServer } from "@modelcontextprotocol/server";
import { getRateLimitStatus } from "../client.js";
import { GUIDE } from "../guidance.js";
import { TOOL_COSTS } from "../tools/rate-limit.js";

export function register(server: McpServer): void {
  server.registerResource(
    "quota",
    "hardcover://quota",
    {
      title: "Cached API Quota",
      description:
        "Zero API calls. Timestamped header observations, local estimates, unknown account tier, cooldowns and first-attempt field costs. Does not refresh upstream quota.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ ...getRateLimitStatus(), tool_costs: TOOL_COSTS }),
        },
      ],
    })
  );
  server.registerResource(
    "usage-guide",
    "hardcover://guide",
    {
      title: "Usage and API Budget Guide",
      description:
        "Zero API calls. Costs, bounded pagination, safe retries, privacy and incomplete result semantics.",
      mimeType: "text/plain",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: GUIDE }] })
  );
}
