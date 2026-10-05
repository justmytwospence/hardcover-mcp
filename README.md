# hardcover-mcp

An MCP server for the [Hardcover](https://hardcover.app) book tracking API. Provides tools, resources, and prompts for searching books, managing your library, creating lists, and more.

## Run it

You need an API key from your [Hardcover account settings](https://hardcover.app/account/api)
(the value includes the `Bearer ` prefix).

### As a service (Docker)

```bash
cp .env.example .env   # fill in HARDCOVER_API_KEY
docker compose up -d
```

The server speaks [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28)
at `http://<host>:8000/mcp` (also at `/`), with a health check at `/health`. It serves both
2026-07-28 clients and older, session-based ones. Point any MCP client at that URL:

```json
{
  "mcpServers": {
    "hardcover": { "type": "http", "url": "http://localhost:8000/mcp" }
  }
}
```

Behind a reverse proxy, set `MCP_ALLOWED_HOSTS` to the public hostname(s); requests naming
any other `Host` are refused.

### Over stdio (local)

```bash
npm install && npm run build
```

```json
{
  "mcpServers": {
    "hardcover": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/hardcover-mcp/dist/index.js"],
      "env": { "HARDCOVER_API_KEY": "Bearer <your-api-key>" }
    }
  }
}
```

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `HARDCOVER_API_KEY` | (required) | Hardcover API key, `Bearer ...` |
| `MCP_TRANSPORT` | `stdio` (`http` in the image) | `stdio` or `http` |
| `PORT` | `8000` | HTTP port |
| `MCP_ALLOWED_HOSTS` | (any) | Comma-separated hostnames allowed in the `Host` header |

## Tools

### Books
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_book` | 1 | Get book details by ID |
| `hardcover_find_books` | 1 | Query books with filters (title, author, year, rating) |
| `hardcover_search_books` | 2 | Full-text search via Typesense |
| `hardcover_search` | 1 | Universal search across books, authors, series, lists, etc. |

### Authors
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_author` | 1 | Get author details by ID |
| `hardcover_find_authors` | 1 | Search authors by name |

### Series
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_series` | 1 | Get series with all books in order |
| `hardcover_find_series` | 1 | Search series by name |

### Editions
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_find_editions` | 1 | Find editions by book ID, ISBN, or ASIN |

### User Library
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_me` | 1 | Get authenticated user's profile |
| `hardcover_get_user` | 1 | Get a user's public profile |
| `hardcover_get_user_books` | 2 | Get books from a user's library with status filter |
| `hardcover_add_user_book` | 1 | Add a book to your library |
| `hardcover_update_user_book` | 1 | Update status, rating, or review |
| `hardcover_remove_user_book` | 1 | Remove a book from your library |

### Lists
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_list` | 1 | Get a list by ID with its books |
| `hardcover_find_lists` | 1 | Search for lists |
| `hardcover_create_list` | 1 | Create a new list |
| `hardcover_update_list` | 1 | Update list name, description, or privacy |
| `hardcover_delete_list` | 1 | Delete a list |
| `hardcover_add_list_book` | 1 | Add a book to a list |
| `hardcover_remove_list_book` | 1 | Remove a book from a list |
| `hardcover_follow_list` | 1 | Follow a list |
| `hardcover_unfollow_list` | 1 | Unfollow a list |

### Social & Activity
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_activity` | 1 | Get activity feed |
| `hardcover_get_journals` | 1 | Get reading journal entries |
| `hardcover_get_goals` | 2 | Get reading goals |
| `hardcover_get_notifications` | 1 | Get your notifications |
| `hardcover_get_prompts` | 1 | Get community discussion prompts |
| `hardcover_get_characters` | 1 | Get fictional characters |
| `hardcover_get_tags` | 1 | Get tags by category (genre, mood, pace, etc.) |

### Rate Limiting
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_rate_limit` | 0 | Check remaining API budget |

The Hardcover API allows 60 requests per minute. Each tool's API cost is included in its description so agents can budget accordingly.

## Resources

Resources provide contextual data that MCP clients can attach to conversations. Each resource is identified by a `hardcover://` URI.

| Resource | URI | Cost | Description |
|----------|-----|------|-------------|
| Profile | `hardcover://profile` | 1 | Authenticated user's profile and reading stats |
| Currently Reading | `hardcover://currently-reading` | 2 | Books you're currently reading |
| Want to Read | `hardcover://want-to-read` | 2 | Your TBR shelf (up to 50 books) |
| Reading Goals | `hardcover://goals` | 2 | Current year's reading goals with progress |
| Book | `hardcover://books/{book_id}` | 1 | Detailed info for a specific book by ID |
| Reference Data | `hardcover://reference/statuses` | 0 | Status codes, tag categories, reading formats, privacy settings |

## Prompts

Prompts are reusable templates for common workflows. They guide the LLM to use the available tools in a structured way.

| Prompt | Args | Description |
|--------|------|-------------|
| `recommend-next-read` | `mood?`, `genre?` | Personalized book recommendation based on your library |
| `reading-year-in-review` | `year?` | Comprehensive annual reading summary |
| `compare-books` | `book_id_1`, `book_id_2` | Side-by-side comparison of two books |
| `tbr-cleanup` | -- | Audit and prioritize your want-to-read list |

## Development

```bash
npm install
npm run dev    # watch mode (stdio)
npm run build  # compile
npm run format # prettier
```

Releases: push a `vX.Y.Z` tag and the `release` workflow publishes
`ghcr.io/justmytwospence/hardcover-mcp:X.Y.Z` (plus `:X.Y` and `:X`) for amd64 and arm64.
