import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { graphql } from "../client.js";
import { formatToolError } from "../errors.js";
import { formatResult } from "../format.js";

const GET_ME_QUERY = `
  query GetMe {
    me {
      id username name bio location
      books_count followers_count followed_users_count
      image { url }
    }
  }
`;

const GET_USER_QUERY = `
  query GetUser($where: users_bool_exp) {
    users(where: $where, limit: 1) {
      id username name bio location
      books_count followers_count followed_users_count
      image { url }
    }
  }
`;

function formatUser(user: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`# ${user.name ?? user.username}`);
  if (user.username) lines.push(`@${user.username}`);
  lines.push("");
  if (user.bio) {
    lines.push(String(user.bio));
    lines.push("");
  }
  if (user.location) lines.push(`**Location:** ${user.location}`);
  if (user.books_count) lines.push(`**Books:** ${user.books_count}`);
  if (user.followers_count) lines.push(`**Followers:** ${user.followers_count}`);
  if (user.followed_users_count) lines.push(`**Following:** ${user.followed_users_count}`);
  return lines.join("\n");
}

export function register(server: McpServer): void {
  server.registerTool(
    "hardcover_get_me",
    {
      title: "Get My Profile",
      description:
        "Get the authenticated user's profile including username, bio, book count, and follower stats.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await graphql<{ me: Array<Record<string, unknown>> }>(GET_ME_QUERY);
        const user = data.me?.[0];
        if (!user) {
          return {
            content: [{ type: "text" as const, text: "Could not retrieve your profile. Check your API key." }],
          };
        }
        return formatResult(user, formatUser(user));
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    "hardcover_get_user",
    {
      title: "Get User",
      description:
        "Get a user's public profile by their ID or username.",
      inputSchema: {
        user_id: z.number().int().optional().describe("Hardcover user ID"),
        username: z.string().optional().describe("Hardcover username"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ user_id, username }) => {
      try {
        if (!user_id && !username) {
          return {
            content: [
              { type: "text" as const, text: "Error: Provide either user_id or username." },
            ],
            isError: true,
          };
        }

        const where: Record<string, unknown> = {};
        if (user_id) where.id = { _eq: user_id };
        if (username) where.username = { _eq: username };

        const data = await graphql<{ users: Array<Record<string, unknown>> }>(
          GET_USER_QUERY,
          { where }
        );
        const user = data.users?.[0];
        if (!user) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No user found with ${user_id ? `ID ${user_id}` : `username "${username}"`}.`,
              },
            ],
          };
        }
        return formatResult(user, formatUser(user));
      } catch (err) {
        return formatToolError(err);
      }
    }
  );
}
