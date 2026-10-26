import test from "node:test";
import assert from "node:assert/strict";
import {
  HardcoverClient,
  HardcoverApiError,
  parseRateLimit,
  DOCUMENTED_PLANS,
} from "../dist/client.js";
import { inspectOperation } from "../dist/operation.js";

const query = "query { me { id } }";
const mutation = "mutation { insert_list(object: {}) { id } }";
const ok = (
  headers = {},
  data = {
    me: [{ id: 1 }],
    a: [{ id: 1 }],
    b: [{ id: 1 }],
    books_aggregate: { aggregate: { count: 1 } },
  }
) => Response.json({ data }, { headers });
const policy = '"Free";q=60;w=60;burst=10, "daily";q=5000;w=86400';
const hdr = (r = 8, daily = 4231, t = 51234) => ({
  "RateLimit-Policy": policy,
  RateLimit: `"Free";r=${r};t=0, "daily";r=${daily};t=${t}`,
});
function fake(responses, options = {}) {
  let now = Date.UTC(2026, 9, 25, 0, 0);
  const waits = [];
  const requests = [];
  const client = new HardcoverClient({
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
    apiKey: () => "Bearer offline",
    fetch: async (url, init) => {
      requests.push({ url, ...JSON.parse(init.body) });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error("Unexpected offline request");
      return response;
    },
    ...options,
  });
  return {
    client,
    waits,
    requests,
    advance: (ms) => {
      now += ms;
    },
  };
}
const code = (expected) => (error) => error instanceof HardcoverApiError && error.code === expected;

test("documented quotas and field counting: aliases, aggregates, nested arguments and introspection", () => {
  assert.deepEqual(DOCUMENTED_PLANS, {
    Free: { daily: 5000, burst: 10, refill_per_minute: 60 },
    Supporter: { daily: 50000, burst: 15, refill_per_minute: 60 },
  });
  assert.deepEqual(
    inspectOperation(
      'query Test($x: Input = {name: "{ me }"}) { a: me { id nested { id } } b: me { id } books_aggregate { aggregate { count } } __typename }'
    ),
    { mutation: false, cost: 3, roots: ["a", "b", "books_aggregate", "__typename"] }
  );
  assert.equal(inspectOperation("{ __schema { types { name } } __typename }").cost, 1);
  assert.equal(
    inspectOperation(
      "mutation { a: insert_reading_journal(object: {}) { id } b: insert_reading_journal(object: {}) { id } update_list(id: 1) { id } }"
    ).cost,
    2
  );
  assert.equal(
    inspectOperation("# mutation fake\nquery X { me @skip(if: false) { id } }").mutation,
    false
  );
  for (const doc of [
    "query { ...F } fragment F on Query { me { id } }",
    "query { me { id } } mutation { delete_list { id } }",
    "subscription { me { id } }",
    "query {",
  ])
    assert.throws(() => inspectOperation(doc));
});

test("zero-call status does not infer an account tier or daily allowance", () => {
  const { client, requests } = fake([]);
  const status = client.getRateLimitStatus();
  assert.equal(status.account_plan, null);
  assert.equal(status.estimates.daily_remaining, null);
  assert.equal(status.authoritative.observed_at, null);
  assert.equal(status.remaining, 10);
  assert.equal(status.total_calls_this_session, 0);
  assert.equal(requests.length, 0);
});

test("modern headers authoritative; PAT burst is taken from policy, not inferred from plan", async () => {
  const headers = {
    "RateLimit-Policy": '"Supporter";q=60;w=60;burst=30, "daily";q=50000;w=86400',
    RateLimit: '"Supporter";r=27;t=0, "daily";r=49100;t=7200',
  };
  const f = fake([ok(headers), ok()]);
  await f.client.graphql(query);
  let s = f.client.getRateLimitStatus();
  assert.equal(s.account_plan, "Supporter");
  assert.equal(s.limit, 30);
  assert.equal(s.remaining, 27);
  assert.equal(s.estimates.daily_remaining, 49100);
  assert.equal(s.estimates.local_daily_safety_cap, 50000);
  assert.equal(s.authoritative.latest_response_headers_complete, true);
  assert.match(s.authoritative.observed_at, /^2026-10-25/);
  await f.client.graphql("{ a: me { id } b: me { id } }");
  s = f.client.getRateLimitStatus();
  assert.equal(s.estimates.daily_remaining, 49098);
  assert.equal(s.estimates.attempted_fields_this_session, 3);
  assert.equal(s.total_calls_this_session, 2);
  assert.equal(s.authoritative.latest_response_headers_complete, false);
  assert.equal(s.authoritative.standing[0].r, 27); // Snapshot isn't mutated into an estimate.
});

test("missing/malformed/legacy headers do not erase local cost accounting", async () => {
  const f = fake([ok(), ok({ RateLimit: "broken", "X-RateLimit-Limit": "99999" })]);
  await f.client.graphql(query);
  await f.client.graphql("{ me { id } books_aggregate { aggregate { count } } }");
  const s = f.client.getRateLimitStatus();
  assert.equal(s.remaining, 7);
  assert.equal(s.account_plan, null);
  assert.equal(s.estimates.attempted_fields_this_session, 3);
  assert.equal(s.authoritative.latest_response_headers_complete, false);
  assert.deepEqual(parseRateLimit('bad, "daily";r=-1;t=0, "Free";r=4;t=0'), [
    { name: "Free", r: 4, t: 0 },
  ]);
});

test("burst reservations are per field and continuously refill at 60/minute", async () => {
  const f = fake(Array.from({ length: 6 }, () => ok()));
  for (let i = 0; i < 6; i++) await f.client.graphql("{ a: me { id } b: me { id } }");
  assert.deepEqual(f.waits, [2000]);
  assert.equal(f.client.getRateLimitStatus().estimates.attempted_fields_this_session, 12);
  f.advance(500);
  assert.equal(f.client.getRateLimitStatus().remaining, 0);
  f.advance(500);
  assert.equal(f.client.getRateLimitStatus().remaining, 1);
});

test("read 429 Retry-After and 503 retries charge every attempt; no oversleep or retry loop", async () => {
  const f = fake([
    new Response(null, { status: 429, headers: { "Retry-After": "2", ...hdr(0, 100) } }),
    new Response(null, { status: 503 }),
    ok(hdr()),
  ]);
  await f.client.graphql(query);
  assert.deepEqual(f.waits, [2000, 2000]);
  assert.equal(f.requests.length, 3);
  assert.equal(f.client.getRateLimitStatus().total_calls_this_session, 3);
  assert.equal(f.client.getRateLimitStatus().estimates.attempted_fields_this_session, 3);
  const exhausted = fake(Array.from({ length: 3 }, () => new Response(null, { status: 429 })));
  await assert.rejects(exhausted.client.graphql(query), code("RATE_LIMITED"));
  assert.equal(exhausted.requests.length, 3);
  assert.equal(
    exhausted.client.getRateLimitStatus().estimates.cooldown_until,
    "2026-10-25T00:00:07.000Z"
  );
});

test("long Retry-After (including HTTP date) is exposed without waiting or additional network calls", async () => {
  for (const retry of ["90", "Sun, 25 Oct 2026 00:01:30 GMT"]) {
    const f = fake([new Response(null, { status: 429, headers: { "Retry-After": retry } })]);
    await assert.rejects(f.client.graphql(query), code("RATE_LIMITED"));
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.waits, []);
    assert.equal(
      f.client.getRateLimitStatus().estimates.cooldown_until,
      "2026-10-25T00:01:30.000Z"
    );
    assert.equal(f.client.getRateLimitStatus().authoritative.retry_after.value, retry);
    assert.equal(
      f.client.getRateLimitStatus().authoritative.retry_after.observed_at,
      "2026-10-25T00:00:00.000Z"
    );
    await assert.rejects(f.client.graphql(query), code("RATE_LIMITED"));
    assert.equal(f.requests.length, 1);
  }
});

test("backoff uses a single total wait budget rather than resetting on each retry", async () => {
  const f = fake([
    new Response(null, { status: 429, headers: { "Retry-After": "6" } }),
    new Response(null, { status: 429, headers: { "Retry-After": "6" } }),
    ok(),
  ]);
  await assert.rejects(f.client.graphql(query), code("RATE_LIMITED"));
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.waits, [6000]);
  assert.equal(f.client.getRateLimitStatus().total_calls_this_session, 2);
});

test("daily-only exhausted headers gate calls until reset; no guessed reset allowance", async () => {
  const f = fake([ok({ "RateLimit-Policy": policy, RateLimit: '"daily";r=0;t=300' }), ok()]);
  await f.client.graphql(query);
  await assert.rejects(f.client.graphql(query), code("RATE_LIMITED"));
  assert.equal(f.requests.length, 1);
  f.advance(300000);
  assert.equal(f.client.getRateLimitStatus().estimates.daily_remaining, null);
  await f.client.graphql(query);
  assert.equal(f.requests.length, 2);
});

test("UTC rollover clears only local daily accounting; fresh allowance remains unknown", async () => {
  const f = fake([ok(hdr())]);
  await f.client.graphql(query);
  f.advance(86400000);
  const status = f.client.getRateLimitStatus();
  assert.equal(status.estimates.attempted_fields_today_this_process, 0);
  assert.equal(status.estimates.daily_remaining, null);
  assert.equal(status.estimates.daily_reset_at, null);
  assert.equal(status.estimates.attempted_fields_this_session, 1);
});

test("local daily safety cap, observed daily cost and request capacity preflight", async () => {
  const f = fake([
    ok({
      "RateLimit-Policy": '"Free";q=60;w=60;burst=10, "daily";q=2;w=86400',
      RateLimit: '"Free";r=9;t=0, "daily";r=1;t=100',
    }),
    ok(),
  ]);
  await f.client.graphql(query);
  await f.client.graphql(query);
  await assert.rejects(f.client.graphql(query), code("LOCAL_BUDGET_EXHAUSTED"));
  assert.equal(f.requests.length, 2);
  const capacity = fake([]);
  await assert.rejects(
    capacity.client.graphql(
      `{ ${Array.from({ length: 11 }, (_, i) => `a${i}: me { id }`).join(" ")} }`
    ),
    code("REQUEST_EXCEEDS_CAPACITY")
  );
  assert.equal(capacity.requests.length, 0);
});

test("mutation transport/timeout/5xx/408/unreadable response is never replayed", async () => {
  for (const response of [
    new Error("socket closed"),
    new DOMException("timeout", "TimeoutError"),
    new Response(null, { status: 503 }),
    new Response(null, { status: 408 }),
    new Response("not json"),
    new Response("x".repeat(2_000_001)),
    Response.json({ data: {} }),
    Response.json({ data: { insert_list: null } }),
    Response.json({ data: { insert_list: true } }),
    Response.json({ data: { insert_list: {} }, errors: {} }),
  ]) {
    const f = fake([response, ok()]);
    await assert.rejects(f.client.graphql(mutation), code("WRITE_OUTCOME_UNKNOWN"));
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.waits, []);
  }
  const f = fake([new Response(null, { status: 429, headers: { "Retry-After": "3" } })]);
  await assert.rejects(f.client.graphql(mutation), code("RATE_LIMITED"));
  assert.equal(f.requests.length, 1);
  assert.match(f.client.getRateLimitStatus().estimates.cooldown_until, /00:00:03/);
});

test("403 is not mislabeled authentication; rejected mutations and partial GraphQL data aren't success", async () => {
  for (const [status, expected] of [
    [401, "AUTH_FAILED"],
    [403, "FORBIDDEN"],
    [400, "HTTP_ERROR"],
  ]) {
    const f = fake([new Response(null, { status })]);
    await assert.rejects(f.client.graphql(query), code(expected));
    assert.equal(f.requests.length, 1);
  }
  for (const data of [
    { insert_list: { errors: ["denied"] } },
    { insert_user_book: { error: "no access" } },
    { delete_list: { success: false } },
  ]) {
    const f = fake([ok({}, data)]);
    const document = `mutation { ${Object.keys(data)[0]} { id } }`;
    await assert.rejects(f.client.graphql(document), (e) => {
      assert.equal(e.code, "MUTATION_REJECTED");
      assert.deepEqual(e.details.partial_data, data);
      return true;
    });
    assert.equal(f.requests.length, 1);
  }
  const f = fake([
    Response.json({ data: { me: [{ id: 1 }] }, errors: [{ message: "partial", path: ["me"] }] }),
  ]);
  await assert.rejects(f.client.graphql(query), (e) => {
    assert.equal(e.code, "GRAPHQL_ERROR");
    assert.deepEqual(e.details.partial_data, { me: [{ id: 1 }] });
    assert.equal(e.path, "me");
    return true;
  });
});

test("reads do not retry arbitrary HTTP, transport or invalid/empty/oversized JSON failures", async () => {
  for (const [response, expected] of [
    [new Error("offline"), "TRANSPORT_ERROR"],
    [new Response("garbage"), "INVALID_RESPONSE"],
    [new Response("x".repeat(2_000_001)), "INVALID_RESPONSE"],
    [Response.json({}), "EMPTY_RESPONSE"],
    [Response.json(null), "INVALID_RESPONSE"],
    [new Response(null, { status: 500 }), "HTTP_ERROR"],
  ]) {
    const f = fake([response, ok()]);
    await assert.rejects(f.client.graphql(query), code(expected));
    assert.equal(f.requests.length, 1);
  }
});

test("concurrent callers are serialized, queue capacity bounded, and reservations cannot oversubscribe", async () => {
  let active = 0;
  let maximum = 0;
  let release;
  const block = new Promise((resolve) => {
    release = resolve;
  });
  const f = fake([], {
    fetch: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await block;
      active--;
      return ok();
    },
  });
  const calls = Array.from({ length: 9 }, () => f.client.graphql(query));
  await assert.rejects(f.client.graphql(query), code("LOCAL_BUSY"));
  assert.equal(f.client.getRateLimitStatus().scheduling.queued, 8);
  release();
  await Promise.all(calls);
  assert.equal(maximum, 1);
  assert.equal(f.client.getRateLimitStatus().total_calls_this_session, 9);
  assert.equal(f.client.getRateLimitStatus().remaining, 1);
});

test("queue timeout is bounded and cleanup preserves exclusive ownership", async () => {
  let release;
  const block = new Promise((resolve) => {
    release = resolve;
  });
  const f = fake([], {
    queueWaitMs: 5,
    fetch: async () => {
      await block;
      return ok();
    },
  });
  const first = f.client.graphql(query);
  await assert.rejects(f.client.graphql(query), code("LOCAL_BUSY"));
  assert.equal(f.client.getRateLimitStatus().scheduling.queued, 0);
  release();
  await first;
  await f.client.graphql(query);
  assert.equal(f.client.getRateLimitStatus().total_calls_this_session, 2);
});

test("missing credentials and unsupported operations cost zero attempts", async () => {
  const saved = process.env.HARDCOVER_API_KEY;
  delete process.env.HARDCOVER_API_KEY;
  try {
    const f = fake([], { apiKey: () => undefined });
    await assert.rejects(f.client.graphql(query), code("AUTH_MISSING"));
    await assert.rejects(f.client.graphql("subscription { me { id } }"), code("INVALID_OPERATION"));
    assert.equal(f.client.getRateLimitStatus().total_calls_this_session, 0);
  } finally {
    process.env.HARDCOVER_API_KEY = saved;
  }
});
