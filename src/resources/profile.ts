import { McpServer } from "@modelcontextprotocol/server";
import { graphql } from "../client.js";

const GET_PROFILE_QUERY = `
  query {
    me {
      id username name bio location
      books_count followers_count followed_users_count
    }
  }
`;

export function register(server: McpServer): void {
  server.registerResource(
    "profile",
    "hardcover://profile",
    {
      description: "The authenticated user's Hardcover profile with reading stats.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const data = await graphql<{
        me: Array<Record<string, unknown>>;
      }>(GET_PROFILE_QUERY);

      const user = data.me?.[0];
      if (!user) {
        return {
          contents: [
            {
              uri: uri.href,
              text: "Could not retrieve profile.",
              mimeType: "text/plain",
            },
          ],
        };
      }

      const lines: string[] = [];
      lines.push(`${user.name ?? user.username} (@${user.username})`);
      if (user.bio) lines.push(String(user.bio));
      if (user.location) lines.push(`Location: ${user.location}`);
      lines.push(
        `Books: ${user.books_count} | Followers: ${user.followers_count} | Following: ${user.followed_users_count}`
      );

      return {
        contents: [{ uri: uri.href, text: lines.join("\n"), mimeType: "text/plain" }],
      };
    }
  );
}
