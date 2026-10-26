import { inspectOperation } from "./operation.js";

const API_URL = "https://api.hardcover.app/v1/graphql";
export const QUOTA_DOCUMENTATION = "https://docs.hardcover.app/api/getting-started#rate-limits";
export const DOCUMENTED_PLANS = {
  Free: { daily: 5_000, burst: 10, refill_per_minute: 60 },
  Supporter: { daily: 50_000, burst: 15, refill_per_minute: 60 },
};
const MAX_WAIT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MAX_RESPONSE_BYTES = 2_000_000;

type Bucket = { name: string; q?: number; w?: number; burst?: number; r?: number; t?: number };

/** Hardcover's documented quoted-name RateLimit structured fields. Ignore invalid entries. */
export function parseRateLimit(value: string | null): Bucket[] {
  if (!value) return [];
  return value.split(",").flatMap((entry) => {
    const match = /^\s*"([^"\\]+)"((?:\s*;\s*[\w-]+\s*=\s*\d+(?:\.\d+)?)*)\s*$/.exec(entry);
    if (!match) return [];
    const bucket: Bucket = { name: match[1] };
    for (const param of match[2].matchAll(/;\s*(q|w|burst|r|t)\s*=\s*(\d+(?:\.\d+)?)/g)) {
      const n = Number(param[2]);
      if (Number.isFinite(n) && n <= 2_147_483_647)
        bucket[param[1] as "q" | "w" | "burst" | "r" | "t"] = n;
    }
    return [bucket];
  });
}

export class HardcoverApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public path?: string,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "HardcoverApiError";
  }
}

type ClientOptions = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  apiKey?: () => string | undefined;
  queueWaitMs?: number;
};

/** One process-wide scheduler shared by stateless HTTP sessions, tools and resources. */
export class HardcoverClient {
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private busy = false;
  private queue: Array<() => void> = [];
  private capacity = 10; // Conservative local fallback, NOT an inferred account tier.
  private refillPerMs = 1 / 1000;
  private tokens = 10;
  private refilledAt: number;
  private attempts = 0;
  private fields = 0;
  private day: string;
  private dailySessionFields = 0;
  private dailyRemaining: number | null = null;
  private dailyReset: number | null = null;
  private dailySafetyCap = 5_000;
  private cooldownUntil = 0;
  private plan: string | null = null;
  private policy: Bucket[] = [];
  private standing: Bucket[] = [];
  private observedAt: number | null = null;
  private policyObservedAt: number | null = null;
  private headersComplete = false;
  private lastResponseAt: number | null = null;
  private retryAfter: { value: string; observed_at: string; until: string } | null = null;

  constructor(private options: ClientOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.refilledAt = this.now();
    this.day = new Date(this.now()).toISOString().slice(0, 10);
  }

  private refresh(): void {
    const now = this.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + Math.max(0, now - this.refilledAt) * this.refillPerMs
    );
    this.refilledAt = now;
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.dailySessionFields = 0;
    }
    // A reset is not proof of fresh account-wide remaining allowance.
    if (this.dailyReset !== null && now >= this.dailyReset) {
      this.dailyRemaining = null;
      this.dailyReset = null;
    }
  }

  getRateLimitStatus() {
    this.refresh();
    const iso = (n: number | null) => (n === null ? null : new Date(n).toISOString());
    return {
      // Compatibility fields are now explicitly LOCAL estimates, not upstream remaining quota.
      remaining: Math.floor(this.tokens),
      limit: this.capacity,
      total_calls_this_session: this.attempts,
      resets_in_seconds: Math.max(
        0,
        Math.ceil(
          Math.max(
            (1 - this.tokens) / this.refillPerMs,
            this.cooldownUntil - this.now(),
            this.dailyRemaining === 0 && this.dailyReset !== null ? this.dailyReset - this.now() : 0
          ) / 1000
        )
      ),
      computed_at: iso(this.now()),
      account_plan: this.plan,
      documented_plans: DOCUMENTED_PLANS,
      documentation: QUOTA_DOCUMENTATION,
      authoritative: {
        policy: this.policy,
        standing: this.standing,
        observed_at: iso(this.observedAt),
        policy_observed_at: iso(this.policyObservedAt),
        last_response_at: iso(this.lastResponseAt),
        retry_after: this.retryAfter,
        latest_response_headers_complete: this.headersComplete,
      },
      estimates: {
        burst_remaining: Math.floor(this.tokens),
        daily_remaining: this.dailyRemaining,
        daily_reset_at: iso(this.dailyReset),
        attempted_fields_this_session: this.fields,
        attempted_fields_today_this_process: this.dailySessionFields,
        local_daily_safety_cap: this.dailySafetyCap,
        refill_per_minute: this.refillPerMs * 60_000,
        cooldown_until: this.cooldownUntil > this.now() ? iso(this.cooldownUntil) : null,
      },
      scheduling: {
        max_concurrency: 1,
        max_queued: 8,
        queued: this.queue.length,
        max_wait_ms: MAX_WAIT_MS,
        max_read_attempts: MAX_ATTEMPTS,
        request_timeout_ms: 30_000,
      },
      uncertainty:
        "Account tier is unknown until observed in RateLimit-Policy. Remaining/limit are local burst estimates. Daily remaining is unknown without fresh headers; other apps sharing this account and restarts are not tracked. Missing/malformed headers do not make requests free. The fallback burst 10 and daily cap 5000 are local safety policy, not an account-tier assertion. All attempts reserve each top-level field (aliases separately, aggregates too); retries cost again. Headers override local estimates.",
    };
  }

  private async acquire(): Promise<() => void> {
    if (!this.busy) {
      this.busy = true;
      return () => this.release();
    }
    if (this.queue.length >= 8)
      throw new HardcoverApiError(
        "Local request queue is full. Retry later; no request sent.",
        "LOCAL_BUSY"
      );
    await new Promise<void>((resolve, reject) => {
      const admitted = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.queue = this.queue.filter((entry) => entry !== admitted);
        reject(
          new HardcoverApiError(
            "Local queue wait exceeded 10 seconds; no request sent.",
            "LOCAL_BUSY"
          )
        );
      }, this.options.queueWaitMs ?? MAX_WAIT_MS);
      this.queue.push(admitted);
    });
    return () => this.release();
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.busy = false;
  }

  private async reserve(cost: number, deadline: number): Promise<void> {
    this.refresh();
    if (cost > this.capacity)
      throw new HardcoverApiError(
        "GraphQL field cost exceeds burst capacity; split the request.",
        "REQUEST_EXCEEDS_CAPACITY"
      );
    if (this.dailySessionFields + cost > this.dailySafetyCap) {
      throw new HardcoverApiError(
        "Local daily safety budget exhausted; no request sent. Check quota status.",
        "LOCAL_BUDGET_EXHAUSTED"
      );
    }
    let wait = Math.max(
      0,
      this.cooldownUntil - this.now(),
      Math.ceil((cost - this.tokens) / this.refillPerMs)
    );
    if (this.dailyRemaining !== null && this.dailyRemaining < cost) {
      if (this.dailyReset === null)
        throw new HardcoverApiError(
          "Observed daily budget exhausted; reset unknown. No request sent.",
          "RATE_LIMITED"
        );
      wait = Math.max(wait, this.dailyReset - this.now());
    }
    if (wait > 0) {
      if (this.now() + wait > deadline) {
        throw new HardcoverApiError(
          "Quota/cooldown wait exceeds the bounded 10-second scheduling budget. Retry later; no additional request sent.",
          "RATE_LIMITED",
          undefined,
          {
            retry_after_seconds: Math.ceil(wait / 1000),
            cooldown_until: new Date(this.now() + wait).toISOString(),
          }
        );
      }
      await this.sleep(wait);
      return this.reserve(cost, deadline);
    }
    this.tokens -= cost;
    if (this.dailyRemaining !== null) this.dailyRemaining = Math.max(0, this.dailyRemaining - cost);
    this.dailySessionFields += cost;
    this.fields += cost;
    this.attempts++;
  }

  private ingest(headers: Headers): void {
    const now = this.now();
    this.lastResponseAt = now;
    const policy = parseRateLimit(headers.get("RateLimit-Policy"));
    const standing = parseRateLimit(headers.get("RateLimit"));
    const validPolicy = policy.filter(
      (b) => b.q !== undefined && b.q > 0 && b.w !== undefined && b.w > 0
    );
    const validStanding = standing.filter((b) => b.r !== undefined && b.t !== undefined);
    if (validPolicy.length) {
      this.policy = validPolicy;
      this.policyObservedAt = now;
      const burst = validPolicy.find((b) => b.burst !== undefined && b.burst > 0);
      if (burst) {
        this.capacity = burst.burst!;
        this.refillPerMs = burst.q! / (burst.w! * 1000);
        this.plan = burst.name;
        this.tokens = Math.min(this.tokens, this.capacity);
      }
      const daily = validPolicy.find((b) => b.w === 86400 || b.name.toLowerCase() === "daily");
      if (daily) this.dailySafetyCap = daily.q!;
    }
    this.headersComplete = validPolicy.length > 0 && validStanding.length > 0;
    if (validStanding.length) {
      this.standing = validStanding;
      this.observedAt = now;
      const dailyName = this.policy.find((b) => b.w === 86400)?.name ?? "daily";
      const daily = validStanding.find((b) => b.name === dailyName);
      if (daily) {
        this.dailyRemaining = daily.r!;
        this.dailyReset = now + daily.t! * 1000;
      }
      const burst = validStanding.find((b) => b.name !== dailyName);
      if (burst) {
        this.tokens = Math.min(this.capacity, burst.r!);
        this.refilledAt = now;
        if (burst.r === 0) this.cooldownUntil = Math.max(this.cooldownUntil, now + burst.t! * 1000);
      }
    }
    const retry = headers.get("Retry-After");
    if (retry !== null) {
      const ms = /^\d+(?:\.\d+)?$/.test(retry.trim())
        ? Number(retry) * 1000
        : Date.parse(retry) - now;
      if (Number.isFinite(ms) && ms >= 0) {
        const until = Math.min(8_640_000_000_000_000, now + ms);
        this.retryAfter = {
          value: retry,
          observed_at: new Date(now).toISOString(),
          until: new Date(until).toISOString(),
        };
        this.cooldownUntil = Math.max(this.cooldownUntil, until);
      }
    }
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    let operation: ReturnType<typeof inspectOperation>;
    try {
      operation = inspectOperation(query);
    } catch {
      throw new HardcoverApiError(
        "Unsupported internal GraphQL document; no request sent.",
        "INVALID_OPERATION"
      );
    }
    const key = this.options.apiKey?.() ?? process.env.HARDCOVER_API_KEY;
    if (!key)
      throw new HardcoverApiError(
        "HARDCOVER_API_KEY environment variable is not set. Get your API key from your Hardcover account settings.",
        "AUTH_MISSING"
      );
    const release = await this.acquire();
    // Queue wait is independently bounded; pacing/backoff share a single 10-second budget.
    const deadline = this.now() + MAX_WAIT_MS;
    try {
      for (let attempt = 1; ; attempt++) {
        await this.reserve(operation.cost, deadline);
        let response: Response;
        try {
          response = await (this.options.fetch ?? globalThis.fetch)(API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: key,
              "User-Agent": "hardcover-mcp-server",
            },
            body: JSON.stringify({ query, variables }),
            signal: AbortSignal.timeout(30_000),
          });
        } catch {
          // Never replay a mutation, including timeouts or connection loss after submission.
          throw new HardcoverApiError(
            operation.mutation
              ? "Write outcome unknown after transport failure. Do not replay; inspect remote state first."
              : "Read transport failed or timed out; retry manually within your budget.",
            operation.mutation ? "WRITE_OUTCOME_UNKNOWN" : "TRANSPORT_ERROR",
            undefined,
            { attempts: attempt }
          );
        }
        this.ingest(response.headers);
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429 || response.status === 503) {
            this.cooldownUntil = Math.max(
              this.cooldownUntil,
              this.now() + 1000 * 2 ** (attempt - 1)
            );
            if (!operation.mutation && attempt < MAX_ATTEMPTS) continue;
          }
          const code =
            response.status === 401
              ? "AUTH_FAILED"
              : response.status === 403
                ? "FORBIDDEN"
                : response.status === 429
                  ? "RATE_LIMITED"
                  : "HTTP_ERROR";
          throw new HardcoverApiError(
            `API request failed with status ${response.status}.${response.status === 403 ? " Check scopes, access and top-level field burst capacity; this does not necessarily mean an invalid key." : ""}${operation.mutation ? " Write was not replayed; inspect remote state before retrying." : ""}`,
            operation.mutation && (response.status >= 500 || response.status === 408)
              ? "WRITE_OUTCOME_UNKNOWN"
              : code,
            undefined,
            { status: response.status, attempts: attempt }
          );
        }
        let body: { data?: T; errors?: Array<{ message: string; path?: string[] }> };
        try {
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Empty response");
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_RESPONSE_BYTES) {
              await reader.cancel();
              throw new Error("Response too large");
            }
            chunks.push(value);
          }
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            (body.errors !== undefined && !Array.isArray(body.errors))
          )
            throw new Error("Invalid response");
        } catch {
          throw new HardcoverApiError(
            operation.mutation
              ? "Write response unreadable, timed out or oversized; outcome unknown. Inspect remote state before retrying."
              : "Read response unreadable, timed out or larger than 2 MB; reduce page size.",
            operation.mutation ? "WRITE_OUTCOME_UNKNOWN" : "INVALID_RESPONSE"
          );
        }
        if (body.errors?.length) {
          const err: unknown = body.errors[0];
          const detail = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
          const message =
            typeof err === "string"
              ? err
              : typeof detail.message === "string"
                ? detail.message
                : "API returned GraphQL errors.";
          throw new HardcoverApiError(
            `${message}${operation.mutation ? " Write was not replayed; inspect remote state before retrying." : ""}`,
            "GRAPHQL_ERROR",
            Array.isArray(detail.path) ? detail.path.join(".") : undefined,
            { partial_data: body.data ?? null, mutation_not_replayed: operation.mutation }
          );
        }
        if (
          !body.data ||
          typeof body.data !== "object" ||
          Array.isArray(body.data) ||
          operation.roots.some(
            (root) =>
              !Object.prototype.hasOwnProperty.call(body.data, root) ||
              (operation.mutation &&
                (!(body.data as Record<string, unknown>)[root] ||
                  typeof (body.data as Record<string, unknown>)[root] !== "object" ||
                  Array.isArray((body.data as Record<string, unknown>)[root])))
          )
        ) {
          throw new HardcoverApiError(
            operation.mutation
              ? "Write returned missing or invalid data; outcome unknown. Inspect remote state before retrying."
              : "API returned empty or incomplete data.",
            operation.mutation ? "WRITE_OUTCOME_UNKNOWN" : "EMPTY_RESPONSE"
          );
        }
        if (operation.mutation) {
          for (const value of Object.values(body.data as Record<string, unknown>)) {
            if (!value || typeof value !== "object") continue;
            const result = value as Record<string, unknown>;
            if (
              result.error ||
              (Array.isArray(result.errors) && result.errors.length) ||
              result.success === false
            ) {
              throw new HardcoverApiError(
                "API rejected the mutation. It was not replayed; inspect returned details and remote state before retrying.",
                "MUTATION_REJECTED",
                undefined,
                { partial_data: body.data }
              );
            }
          }
        }
        return body.data;
      }
    } finally {
      release();
    }
  }
}

const client = new HardcoverClient();
export const getRateLimitStatus = () => client.getRateLimitStatus();
export const graphql = <T>(query: string, variables?: Record<string, unknown>) =>
  client.graphql<T>(query, variables);
