const API_URL = "https://api.hardcover.app/v1/graphql";
const MAX_REQUESTS_PER_MINUTE = 60;

let tokenBucket = MAX_REQUESTS_PER_MINUTE;
let lastRefill = Date.now();
let totalCallsThisSession = 0;

function consumeToken(): void {
  const now = Date.now();
  const elapsed = now - lastRefill;
  const refill = Math.floor((elapsed / 60_000) * MAX_REQUESTS_PER_MINUTE);
  if (refill > 0) {
    tokenBucket = Math.min(MAX_REQUESTS_PER_MINUTE, tokenBucket + refill);
    lastRefill = now;
  }
  if (tokenBucket <= 0) {
    throw new HardcoverApiError(
      "Rate limit exceeded (60 requests/minute). Wait a moment and try again.",
      "RATE_LIMITED"
    );
  }
  tokenBucket--;
  totalCallsThisSession++;
}

export function getRateLimitStatus(): {
  remaining: number;
  limit: number;
  total_calls_this_session: number;
  resets_in_seconds: number;
} {
  const now = Date.now();
  const elapsed = now - lastRefill;
  const refill = Math.floor((elapsed / 60_000) * MAX_REQUESTS_PER_MINUTE);
  const current = Math.min(MAX_REQUESTS_PER_MINUTE, tokenBucket + refill);
  const secondsUntilNextRefill = Math.max(0, Math.ceil((60_000 - elapsed) / 1000));
  return {
    remaining: current,
    limit: MAX_REQUESTS_PER_MINUTE,
    total_calls_this_session: totalCallsThisSession,
    resets_in_seconds: secondsUntilNextRefill,
  };
}

export class HardcoverApiError extends Error {
  code: string;
  path?: string;

  constructor(message: string, code: string, path?: string) {
    super(message);
    this.name = "HardcoverApiError";
    this.code = code;
    this.path = path;
  }
}

function getApiKey(): string {
  const key = process.env.HARDCOVER_API_KEY;
  if (!key) {
    throw new HardcoverApiError(
      "HARDCOVER_API_KEY environment variable is not set. Get your API key from your Hardcover account settings.",
      "AUTH_MISSING"
    );
  }
  return key;
}

export async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  consumeToken();

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getApiKey(),
      "User-Agent": "hardcover-mcp-server/1.0",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new HardcoverApiError(
        "Authentication failed. Check that your HARDCOVER_API_KEY is valid and not expired.",
        "AUTH_FAILED"
      );
    }
    throw new HardcoverApiError(`API request failed with status ${response.status}.`, "HTTP_ERROR");
  }

  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string; path?: string[] }>;
  };

  if (body.errors && body.errors.length > 0) {
    const err = body.errors[0];
    throw new HardcoverApiError(err.message, "GRAPHQL_ERROR", err.path?.join("."));
  }

  if (!body.data) {
    throw new HardcoverApiError("API returned an empty response.", "EMPTY_RESPONSE");
  }

  return body.data;
}
