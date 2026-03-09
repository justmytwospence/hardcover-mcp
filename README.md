# hardcover-mcp

An MCP server for the [Hardcover](https://hardcover.app) book tracking API. Provides 31 tools for searching books, managing your library, creating lists, and more.

## Setup

1. Get your API key from your [Hardcover account settings](https://hardcover.app/account/api)

2. Install globally:

```bash
npm install -g .
```

3. Add to your Claude Code config (`~/.claude.json` for user scope, or `.mcp.json` for project scope):

```json
{
  "mcpServers": {
    "hardcover": {
      "type": "stdio",
      "command": "hardcover-mcp-server",
      "env": {
        "HARDCOVER_API_KEY": "Bearer <your-api-key>"
      }
    }
  }
}
```

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

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # compile
```
