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
| `hardcover_find_books` | 2 | Query books with filters (title, author, year, rating) |
| `hardcover_search_books` | 1–2 | Typesense search, then batched details if nonempty |
| `hardcover_search` | 1 | Universal search across books, authors, series, lists, etc. |

### Authors
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_author` | 1 | Get author details by ID |
| `hardcover_find_authors` | 1 | Search authors by name |

### Series
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_series` | 1 | Get series with up to 100 books in order |
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
| `hardcover_get_user_books` | 1–2 | Get one library page with status filter |
| `hardcover_add_user_book` | 1 | Add a book to your library |
| `hardcover_update_user_book` | 1 | Update status, rating, or review |
| `hardcover_remove_user_book` | 1 | Remove a book from your library |

### Lists
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_list` | 1 | Get a list by ID with its first 50 books |
| `hardcover_find_lists` | 2 | Search for lists |
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
| `hardcover_get_goals` | 1–2 | Get up to 100 reading goals |
| `hardcover_get_notifications` | 1 | Get your notifications |
| `hardcover_get_prompts` | 1 | Get community discussion prompts |
| `hardcover_get_characters` | 1 | Get fictional characters |
| `hardcover_get_tags` | 2 | Get tags by category (genre, mood, pace, etc.) |

### Rate Limiting
| Tool | Cost | Description |
|------|------|-------------|
| `hardcover_get_rate_limit` | 0 | Check remaining API budget |

Costs above are **top-level GraphQL fields on first attempts**, not HTTP requests. Aliases and aggregates count separately; nested selections are free, and every attempt costs at least one. For example, find_books/find_lists/get_tags each use one HTTP request with two charged fields. get_user_books/get_goals cost 1 with a known user_id, otherwise up to 2. Retries cost again. All tools declare all four hints; updates that replace data and relationship removals are destructive-capable. Hints do not enforce authorization or approval.

### Quota and safe retries

Official [rate-limit documentation](https://docs.hardcover.app/api/getting-started#rate-limits):

| Documented plan | Daily field allowance | Burst | Refill |
|---|---|---|---|
| Free | 5,000 | 10 | 60/minute |
| Supporter | 50,000 | 15 | 60/minute |

**The account tier is unknown until observed in headers.** PAT/legacy authentication can have different effective burst capacity. `RateLimit-Policy`, `RateLimit` and `Retry-After` are authoritative, including any custom allowance. Verified against the official [documentation source](https://github.com/hardcoverapp/hardcover-docs/blob/0820baf5d0bb0d9cac140b6fcf433e131456c40b/src/content/docs/api/Getting-Started.mdx) before implementing this model.

`hardcover_get_rate_limit` and `hardcover://quota` are **zero-network** views of timestamped header snapshots and local estimates; they never probe the account. Compatibility fields `remaining`/`limit` are local burst estimates, not account-wide quota. Daily remaining stays unknown without headers and becomes unknown again after an observed reset. Other clients, replicas and process restarts are not tracked; missing headers do not make attempts free.

One process-wide scheduler serializes upstream requests across HTTP sessions, tools and resources: at most 8 queued, queue wait at most 10 seconds, and pacing/backoff at most 10 seconds per GraphQL operation. Each HTTP attempt times out after 30 seconds; responses over 2 MB fail explicitly. Unknown policy uses conservative **local** burst 10, refill 60/minute, daily safety cap 5,000 per process/UTC day, not a guessed account tier. Observed policy overrides these fallback settings.

Only read HTTP 429/503 responses are retried automatically, at most 3 attempts total, with exponential backoff respecting authoritative cooldowns. Long waits fail with retry timing rather than sleeping indefinitely. Other read failures are returned for budget-aware manual handling. **No mutation is automatically replayed**, including 429, 5xx, timeout or connection loss. An ambiguous write must be reconciled with a bounded read before any authorized retry. A 403 may indicate scope/access restrictions or excessive top-level field count, not an invalid key.

Results retain existing text and add `structuredContent.data` (including fields/pagination omitted by markdown), with explicit truncation metadata. Text is capped at 25,000 characters plus a truncation notice; machine data over 500,000 characters becomes a marked JSON prefix, not a complete object. GraphQL partial data is returned in a machine-readable error, never as complete success. No output schema is advertised for variable upstream data. Paginated reads without a total report `has_more: "unknown"` for a full page; they do not claim a complete library.

Documentation source revision: `0820baf5d0bb0d9cac140b6fcf433e131456c40b` (official `hardcoverapp/hardcover-docs`, retrieved during this change).

## Resources

Resources provide contextual data that MCP clients can attach to conversations. Each resource is identified by a `hardcover://` URI.

| Resource | URI | Cost | Description |
|----------|-----|------|-------------|
| Quota | `hardcover://quota` | 0 | Cached header observations, local estimates and cooldowns |
| Usage Guide | `hardcover://guide` | 0 | Costs, pagination, privacy and safe retries |
| Profile | `hardcover://profile` | 1 | Authenticated user's profile and reading stats |
| Currently Reading | `hardcover://currently-reading` | 2 | First 50 currently-reading books |
| Want to Read | `hardcover://want-to-read` | 2 | Your TBR shelf (up to 50 books) |
| Reading Goals | `hardcover://goals` | 2 | Current year's goals, up to 100 |
| Book | `hardcover://books/{book_id}` | 1 | Book detail with bounded nested selections |
| Shelf Page | `hardcover://shelves/{user_id}/{status_id}/{limit}/{offset}` | 1 | One authorized user/status shelf page, no profile lookup |
| List Page | `hardcover://lists/{list_id}/{limit}/{offset}` | 1 | List metadata and one book page |
| Reference Data | `hardcover://reference/statuses` | 0 | Status codes, tag categories, reading formats, privacy settings |

Remote resource reads use the same token, privacy/scopes, quota scheduler and safe read retries as tools; listed costs exclude retries. Discovery and prompt retrieval never contact Hardcover. Page templates require positive integer IDs, shelf status 1–6, limit 1–100 and offset >=0. Pages are valid JSON under 25,000 characters; if trimmed they advance only over delivered rows. A single oversized row returns an explicit incomplete-page error. `books_count` may not equal accessible rows. Legacy text resources are capped; use paginated templates/tools rather than assuming full coverage. No subscriptions or background jobs are added.

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
npm run build  # compile/typecheck
npm test       # offline unit + HTTP wire-contract tests (network blocked)
npm run test:coverage # Node built-in coverage; used by CI and release gate (Node 22+/CI 24)
npm run format # prettier, if available locally
```

Tests use injected transports/clocks and synthetic API fixtures only: no real account calls or writes. CI and the release workflow must pass build and offline tests before image publication, with coverage floors of 90% lines, 65% branches and 95% functions for loaded server modules (the CLI entry is not exercised). No new test dependencies are required. Existing prompts check budget first, bound page/detail fan-out, disclose partial coverage and never authorize writes.

Releases: push a `vX.Y.Z` tag and the `release` workflow publishes
`ghcr.io/justmytwospence/hardcover-mcp:X.Y.Z` (plus `:X.Y` and `:X`) for amd64 and arm64.
