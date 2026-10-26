import { McpServer } from "@modelcontextprotocol/server";
import { USER_BOOK_STATUS_LABELS, TAG_CATEGORY_LABELS, CONTRIBUTION_ROLES } from "../types.js";

export function register(server: McpServer): void {
  server.registerResource(
    "reference-statuses",
    "hardcover://reference/statuses",
    {
      description:
        "Zero API calls. Local reference data for Hardcover status codes, tag categories, reading formats, and privacy settings.",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = {
        user_book_statuses: USER_BOOK_STATUS_LABELS,
        tag_categories: TAG_CATEGORY_LABELS,
        reading_formats: { 1: "Physical", 2: "Audio", 3: "Both", 4: "eBook" },
        privacy_settings: { 1: "Public", 2: "Followers", 3: "Private" },
        contribution_roles: CONTRIBUTION_ROLES,
      };
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(data, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );
}
