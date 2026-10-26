import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer, VERSION } from "../dist/server.js";
import { TOOL_COSTS } from "../dist/tools/rate-limit.js";
import { inspectOperation } from "../dist/operation.js";
import { formatResult, CHARACTER_LIMIT } from "../dist/format.js";
import { formatToolError } from "../dist/errors.js";
import { HardcoverApiError } from "../dist/client.js";
import { pageContent, uriInteger } from "../dist/resources/pages.js";

const handler = createMcpHandler(createServer);
after(() => handler.close());
let id = 0;
async function rpc(method, params = {}, modern = false) {
  const version = modern ? "2026-07-28" : "2025-11-25";
  const response = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": version,
        ...(modern ? { "Mcp-Method": method } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++id,
        method,
        params: {
          ...params,
          ...(modern
            ? {
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": version,
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              }
            : {}),
        },
      }),
    })
  );
  assert.equal(response.status, 200);
  const text = await response.text();
  return JSON.parse(
    text.startsWith("event:")
      ? text
          .split("\n")
          .find((line) => line.startsWith("data: "))
          .slice(6)
      : text
  );
}
const result = async (...args) => {
  const reply = await rpc(...args);
  assert.equal(reply.error, undefined, JSON.stringify(reply.error));
  return reply.result;
};
const call = (name, args = {}) => result("tools/call", { name, arguments: args });
const book = {
  id: 1,
  title: "Offline Book",
  rating: 4,
  description: "Fixture",
  contributions: [{ author: { id: 2, name: "Writer" } }],
};
const user = { id: 3, name: "Reader", username: "reader", books_count: 4 };
const userBook = { id: 4, status_id: 1, rating: 3, review_raw: "Not in markdown", book };
const listBook = { id: 5, position: 1, book };
const list = { id: 6, name: "Offline List", books_count: 1, user, list_books: [listBook] };
const aggregate = { aggregate: { count: 1 } };
function fixtures() {
  return {
    books_by_pk: book,
    books: [book],
    books_aggregate: aggregate,
    authors_by_pk: { id: 2, name: "Writer", contributions: [{ book }] },
    authors: [{ id: 2, name: "Writer" }],
    series_by_pk: { id: 7, name: "Series", book_series: [{ position: "1", book }] },
    series: [{ id: 7, name: "Series" }],
    editions: [{ id: 8, title: "Edition" }],
    me: [user],
    users: [user],
    user_books: [userBook],
    insert_user_book: { id: 4, user_book: userBook },
    update_user_book: { id: 4, user_book: userBook },
    delete_user_book: { id: 4, book_id: 1 },
    lists_by_pk: list,
    lists: [list],
    lists_aggregate: aggregate,
    insert_list: { id: 6, list },
    update_list: { id: 6, list },
    delete_list: { success: true },
    insert_list_book: { id: 5, list_book: listBook },
    delete_list_book: { id: 5, list_id: 6 },
    upsert_followed_list: { id: 6, errors: null },
    delete_followed_list: { success: true },
    search: { ids: [1], results: { hits: [{ document: book }] } },
    activities: [{ id: 9, event: "read", data: { book_title: "Offline Book" }, user }],
    reading_journals: [{ id: 10, entry: "Note", event: "quote", book, user }],
    goals: [{ id: 11, metric: "books", goal: 10, progress: 1, state: "active" }],
    notifications: [{ id: 12, title: "Notice" }],
    prompts: [{ id: 13, question: "Favorite?" }],
    characters: [{ id: 14, name: "Someone" }],
    tags: [{ id: 15, tag: "Fantasy", tag_category_id: 1 }],
    tags_aggregate: aggregate,
  };
}
const requests = [];
let respond = () => fixtures();
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://api.hardcover.app/v1/graphql");
  const request = JSON.parse(init.body);
  requests.push(request);
  const data = respond(request);
  if (data instanceof Response) return data;
  return Response.json(
    { data },
    {
      headers: {
        // Synthetic authoritative bucket to avoid real-time pacing in wire tests.
        "RateLimit-Policy": '"Offline";q=60;w=60;burst=1000000, "daily";q=1000000;w=86400',
        RateLimit: '"Offline";r=999999;t=0, "daily";r=999999;t=86400',
      },
    }
  );
};

const inputs = {
  hardcover_get_book: { book_id: 1 },
  hardcover_find_books: {},
  hardcover_search_books: { query: "book" },
  hardcover_get_author: { author_id: 2 },
  hardcover_find_authors: {},
  hardcover_get_series: { series_id: 7 },
  hardcover_find_series: {},
  hardcover_find_editions: { book_id: 1 },
  hardcover_get_me: {},
  hardcover_get_user: { user_id: 3 },
  hardcover_get_user_books: {},
  hardcover_add_user_book: { book_id: 1, status_id: 1 },
  hardcover_update_user_book: { user_book_id: 4, rating: 4 },
  hardcover_remove_user_book: { user_book_id: 4 },
  hardcover_get_list: { list_id: 6 },
  hardcover_find_lists: {},
  hardcover_create_list: { name: "New" },
  hardcover_update_list: { list_id: 6, name: "Renamed" },
  hardcover_delete_list: { list_id: 6 },
  hardcover_add_list_book: { list_id: 6, book_id: 1 },
  hardcover_remove_list_book: { list_book_id: 5 },
  hardcover_follow_list: { list_id: 6 },
  hardcover_unfollow_list: { list_id: 6 },
  hardcover_search: { query: "book" },
  hardcover_get_activity: {},
  hardcover_get_journals: {},
  hardcover_get_goals: {},
  hardcover_get_characters: {},
  hardcover_get_prompts: {},
  hardcover_get_notifications: {},
  hardcover_get_tags: {},
  hardcover_get_rate_limit: {},
};
const mutations = {
  hardcover_add_user_book: [false, false],
  hardcover_update_user_book: [true, true],
  hardcover_remove_user_book: [true, false],
  hardcover_create_list: [false, false],
  hardcover_update_list: [true, true],
  hardcover_delete_list: [true, false],
  hardcover_add_list_book: [false, false],
  hardcover_remove_list_book: [true, false],
  hardcover_follow_list: [false, true],
  hardcover_unfollow_list: [true, true],
};

test("initialize, exact tool inventory and complete accurate annotations are local", async () => {
  const before = requests.length;
  const init = await result("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "offline", version: "1" },
  });
  assert.equal(init.serverInfo.version, VERSION);
  for (const key of ["tools", "resources", "prompts"]) assert.ok(init.capabilities[key]);
  for (const token of [
    "5000/day",
    "50000/day",
    "RateLimit",
    "Retry-After",
    "NEVER",
    "unknown",
    "zero network",
  ])
    assert.ok(init.instructions.includes(token), token);
  const { tools } = await result("tools/list");
  assert.deepEqual(tools.map((t) => t.name).sort(), Object.keys(inputs).sort());
  assert.deepEqual(Object.keys(TOOL_COSTS).sort(), Object.keys(inputs).sort());
  for (const tool of tools) {
    assert.ok(tool.title);
    assert.ok(tool.description.includes("API cost"));
    assert.ok(tool.inputSchema);
    const expected = mutations[tool.name];
    assert.deepEqual(
      tool.annotations,
      {
        readOnlyHint: !expected,
        destructiveHint: expected?.[0] ?? false,
        idempotentHint: expected?.[1] ?? true,
        openWorldHint: tool.name !== "hardcover_get_rate_limit",
      },
      tool.name
    );
    if (expected) assert.match(tool.description, /Never automatically replay/);
  }
  assert.equal(requests.length, before);
});

test("modern stateless discovery exposes the same local capabilities and instructions", async () => {
  const before = requests.length;
  const discovered = await result("server/discover", {}, true);
  assert.match(discovered.instructions, /quota/);
  assert.ok(discovered.supportedVersions.includes("2026-07-28"));
  for (const key of ["tools", "resources", "prompts"]) assert.ok(discovered.capabilities[key]);
  assert.equal((await result("tools/list", {}, true)).tools.length, Object.keys(inputs).length);
  assert.equal((await result("resources/list", {}, true)).resources.length, 7);
  assert.equal((await result("resources/templates/list", {}, true)).resourceTemplates.length, 3);
  assert.equal((await result("prompts/list", {}, true)).prompts.length, 4);
  assert.equal(requests.length, before);
});

test("all tool handlers keep compatible text plus machine data; advertised maximum costs match actual fields", async () => {
  for (const [name, args] of Object.entries(inputs)) {
    const before = requests.length;
    const reply = await call(name, args);
    assert.ok(!reply.isError, `${name}: ${JSON.stringify(reply)}`);
    assert.equal(reply.content[0].type, "text");
    assert.ok(reply.structuredContent && "data" in reply.structuredContent, name);
    const calls = requests.slice(before);
    assert.equal(
      calls.reduce((n, r) => n + inspectOperation(r.query).cost, 0),
      TOOL_COSTS[name],
      name
    );
    assert.equal(
      calls.some((r) => inspectOperation(r.query).mutation),
      Boolean(mutations[name]),
      name
    );
  }
});

test("conditional costs reuse user IDs and search emptiness without hidden followups", async () => {
  for (const name of ["hardcover_get_user_books", "hardcover_get_goals"]) {
    const before = requests.length;
    await call(name, { user_id: 3 });
    assert.equal(requests.length - before, 1);
  }
  const before = requests.length;
  respond = () => ({ search: { ids: [], results: { hits: [] } } });
  try {
    assert.match(
      (await call("hardcover_search_books", { query: "empty" })).content[0].text,
      /No books/
    );
  } finally {
    respond = () => fixtures();
  }
  assert.equal(requests.length - before, 1);
});

test("tool inputs validate at runtime before I/O and semantic no-op updates remain errors", async () => {
  const before = requests.length;
  for (const [name, args] of [
    ["hardcover_get_book", { book_id: "1" }],
    ["hardcover_get_book", { book_id: -1 }],
    ["hardcover_get_book", { book_id: 2147483648 }],
    ["hardcover_add_user_book", { book_id: 1, status_id: 7 }],
    ["hardcover_get_user_books", { limit: 101 }],
    ["hardcover_get_user_books", { offset: -1 }],
    ["hardcover_search", { query: "", type: "Book" }],
    ["hardcover_search", { query: "a", type: "wrong" }],
    ["hardcover_update_list", { list_id: 6 }],
    ["hardcover_update_user_book", { user_book_id: 4 }],
    ["hardcover_find_editions", {}],
    ["hardcover_get_user", {}],
  ]) {
    const reply = await rpc("tools/call", { name, arguments: args });
    assert.ok(reply.error || reply.result.isError, `${name}: ${JSON.stringify(reply)}`);
  }
  assert.equal(requests.length, before);
});

test("structured results retain review, IDs and pagination absent from markdown", async () => {
  const reply = await call("hardcover_get_user_books", { user_id: 3, limit: 1 });
  assert.doesNotMatch(reply.content[0].text, /Not in markdown/);
  assert.equal(reply.structuredContent.data.user_books[0].review_raw, "Not in markdown");
  assert.deepEqual(reply.structuredContent.data.pagination, {
    count: 1,
    limit: 1,
    offset: 0,
    has_more: "unknown",
    next_offset: 1,
  });
  const aggregated = await call("hardcover_find_books", { offset: 0 });
  assert.equal(aggregated.structuredContent.data.pagination.total_count, 1);
  assert.equal(aggregated.structuredContent.data.pagination.has_more, false);
});

test("resource/template discovery, quota/reference/guide reads and prompt retrieval never call upstream", async () => {
  const before = requests.length;
  const { resources } = await result("resources/list");
  assert.deepEqual(
    resources.map((r) => r.uri).sort(),
    [
      "hardcover://quota",
      "hardcover://guide",
      "hardcover://profile",
      "hardcover://currently-reading",
      "hardcover://want-to-read",
      "hardcover://goals",
      "hardcover://reference/statuses",
    ].sort()
  );
  const { resourceTemplates } = await result("resources/templates/list");
  assert.deepEqual(
    resourceTemplates.map((r) => r.uriTemplate).sort(),
    [
      "hardcover://books/{book_id}",
      "hardcover://shelves/{user_id}/{status_id}/{limit}/{offset}",
      "hardcover://lists/{list_id}/{limit}/{offset}",
    ].sort()
  );
  for (const item of [...resources, ...resourceTemplates])
    assert.match(item.description, /(?:API field|API call)/i, item.name);
  for (const uri of ["hardcover://quota", "hardcover://guide", "hardcover://reference/statuses"]) {
    const reply = await result("resources/read", { uri });
    assert.ok(reply.contents[0].text.length <= CHARACTER_LIMIT);
    if (uri === "hardcover://quota")
      assert.equal(JSON.parse(reply.contents[0].text).account_plan, "Offline");
  }
  const { prompts } = await result("prompts/list");
  assert.deepEqual(
    prompts.map((p) => p.name).sort(),
    ["recommend-next-read", "reading-year-in-review", "compare-books", "tbr-cleanup"].sort()
  );
  for (const prompt of prompts) {
    const reply = await result("prompts/get", {
      name: prompt.name,
      arguments: prompt.name === "compare-books" ? { book_id_1: "1", book_id_2: "2" } : {},
    });
    const text = reply.messages[0].content.text;
    for (const term of [
      "hardcover_get_rate_limit",
      "budget",
      "Retry-After",
      "partial coverage",
      "ambiguous write",
    ])
      assert.ok(text.includes(term), `${prompt.name}: ${term}`);
  }
  assert.equal(requests.length, before);
});

test("remote resources have honest field costs, bounded pagination, and no mutation", async () => {
  for (const [uri, fields] of [
    ["hardcover://profile", 1],
    ["hardcover://currently-reading", 2],
    ["hardcover://want-to-read", 2],
    ["hardcover://goals", 2],
    ["hardcover://books/1", 1],
    ["hardcover://shelves/3/1/20/0", 1],
    ["hardcover://lists/6/20/0", 1],
  ]) {
    const before = requests.length;
    const reply = await result("resources/read", { uri });
    assert.ok(reply.contents[0].text.length < CHARACTER_LIMIT + 150);
    const calls = requests.slice(before);
    assert.equal(
      calls.reduce((n, r) => n + inspectOperation(r.query).cost, 0),
      fields,
      uri
    );
    assert.ok(calls.every((r) => !inspectOperation(r.query).mutation));
    if (uri.includes("/20/0")) {
      assert.deepEqual(calls[0].variables.limit, 20);
      assert.equal(calls[0].variables.offset, 0);
      assert.equal(JSON.parse(reply.contents[0].text).pagination.count, 1);
    }
    if (uri.includes("shelves/"))
      assert.deepEqual(calls[0].variables.where, { user_id: { _eq: 3 }, status_id: { _eq: 1 } });
  }
  const page = await result("resources/read", { uri: "hardcover://lists/6/1/5" });
  const json = JSON.parse(page.contents[0].text);
  assert.equal(json.pagination.offset, 5);
  assert.equal(json.pagination.next_offset, 6);
  assert.equal(json.pagination.has_more, "unknown");
});

test("resource URIs and prompt IDs are strictly validated before upstream I/O", async () => {
  const before = requests.length;
  for (const uri of [
    "hardcover://books/1oops",
    "hardcover://books/-1",
    "hardcover://books/2147483648",
    "hardcover://shelves/3/7/20/0",
    "hardcover://shelves/3/1/101/0",
    "hardcover://shelves/3/1/20/-1",
    "hardcover://lists/6/2x/0",
    "hardcover://lists/6/20/2147483648",
    "hardcover://unknown",
  ]) {
    const reply = await rpc("resources/read", { uri });
    assert.ok(reply.error || /Invalid/.test(reply.result.contents[0].text), uri);
  }
  for (const [name, args] of [
    ["compare-books", { book_id_1: "1oops", book_id_2: "2" }],
    ["compare-books", { book_id_1: "1" }],
    ["reading-year-in-review", { year: "yesterday" }],
  ]) {
    const reply = await rpc("prompts/get", { name, arguments: args });
    assert.ok(reply.error, JSON.stringify(reply));
  }
  assert.equal(requests.length, before);
});

test("profile failure is not converted into an unscoped goals query; missing lists stay not-found", async () => {
  const before = requests.length;
  respond = () => ({ me: [] });
  try {
    assert.equal((await call("hardcover_get_goals")).isError, true);
  } finally {
    respond = () => fixtures();
  }
  assert.equal(requests.length - before, 1);
  respond = () => ({ lists_by_pk: null });
  try {
    const reply = await result("resources/read", { uri: "hardcover://lists/6/20/0" });
    assert.match(reply.contents[0].text, /not found or inaccessible/);
  } finally {
    respond = () => fixtures();
  }
});

test("wire errors retain compatible text plus machine error codes and partial data", async () => {
  respond = () =>
    Response.json({
      data: { books: [book] },
      errors: [{ message: "partial access", path: ["books"] }],
    });
  try {
    const reply = await call("hardcover_find_books");
    assert.equal(reply.isError, true);
    assert.match(reply.content[0].text, /^Error: partial access/);
    assert.equal(reply.structuredContent.data.error.code, "GRAPHQL_ERROR");
    assert.equal(reply.structuredContent.data.error.partial_data.books[0].id, 1);
  } finally {
    respond = () => fixtures();
  }
  respond = () => ({ delete_list: { success: false } });
  try {
    assert.equal((await call("hardcover_delete_list", { list_id: 6 })).isError, true);
  } finally {
    respond = () => fixtures();
  }
});

test("format bounds, resource whole-row trimming, and truncation metadata remain honest", () => {
  const reply = formatResult({ secret_machine_field: "retained" }, "x".repeat(30000));
  assert.equal(reply.structuredContent.data.secret_machine_field, "retained");
  assert.equal(reply.structuredContent.metadata.text_truncated, true);
  assert.ok(reply.content[0].text.length < 25200);
  const huge = formatResult({ huge: "x".repeat(600000) });
  assert.equal(huge.structuredContent.metadata.data_truncated, true);
  assert.equal(huge.structuredContent.data.truncated_json_prefix.length, 500000);
  const page = JSON.parse(
    pageContent(
      new URL("hardcover://lists/1/10/0"),
      "rows",
      Array.from({ length: 10 }, (_, i) => ({ id: i, title: "x".repeat(5000) })),
      10,
      0
    ).contents[0].text
  );
  assert.ok(page.rows.length < 10);
  assert.equal(page.pagination.next_offset, page.rows.length);
  assert.equal(page.pagination.truncated, true);
  const oversize = JSON.parse(
    pageContent(new URL("hardcover://lists/1/1/0"), "rows", [{ title: "x".repeat(26000) }], 1, 0)
      .contents[0].text
  );
  assert.equal(oversize.pagination.next_offset, null);
  assert.match(oversize.error, /incomplete/);
  assert.throws(() => uriInteger(["1"], "id"));
  assert.throws(() => uriInteger("1.5", "id"));
  assert.equal(formatToolError(new HardcoverApiError("error", "TEST")).isError, true);
  assert.equal(formatToolError("oops").structuredContent.data.error.code, "INTERNAL_ERROR");
});
