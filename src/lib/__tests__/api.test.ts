import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiFailure, attempt } from "@/lib/api";

describe("ApiFailure", () => {
  it("classifies an insufficient-data response as such", () => {
    // A 409 is the backend correctly declining to compute a statistic, not an
    // error to hide behind "something went wrong".
    const failure = new ApiFailure(409, "insufficient_data", "only 12 bars available");
    expect(failure.isInsufficientData).toBe(true);
    expect(failure.isNotFound).toBe(false);
    expect(failure.isUnreachable).toBe(false);
  });

  it("classifies a not-found response", () => {
    const failure = new ApiFailure(404, "not_found", "no instrument matches 'ZZZZ'");
    expect(failure.isNotFound).toBe(true);
    expect(failure.isInsufficientData).toBe(false);
  });

  it("classifies an unreachable backend by its zero status", () => {
    const failure = new ApiFailure(0, "backend_unreachable", "connection refused");
    expect(failure.isUnreachable).toBe(true);
  });

  it("preserves the backend's own message and details", () => {
    const failure = new ApiFailure(409, "insufficient_data", "needs 100 bars, has 12", {
      required: 100,
      available: 12,
    });
    expect(failure.message).toBe("needs 100 bars, has 12");
    expect(failure.details["required"]).toBe(100);
  });
});

describe("attempt", () => {
  it("wraps a resolved value", async () => {
    const result = await attempt(Promise.resolve(42));
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("wraps an ApiFailure so a page can render it", async () => {
    const failure = new ApiFailure(409, "insufficient_data", "too few bars");
    const result = await attempt(Promise.reject(failure));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isInsufficientData).toBe(true);
    }
  });

  it("rethrows anything that is not an ApiFailure", async () => {
    // A programming error must not be presented to the user as a data problem.
    await expect(attempt(Promise.reject(new TypeError("bug")))).rejects.toThrow(TypeError);
  });
});

describe("request behaviour", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.API_BASE_URL = "http://backend.test/api/v1";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("surfaces a structured backend error unchanged", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "insufficient_data",
          message: "AAPL has 12 bars but 30 are needed",
          details: { available: 12, required: 30 },
        }),
        { status: 409 },
      ),
    ) as unknown as typeof fetch;

    const { api } = await import("@/lib/api");
    const result = await attempt(api.presentAnalysis("AAPL"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("insufficient_data");
      expect(result.error.message).toContain("30 are needed");
      expect(result.error.details["available"]).toBe(12);
    }
  });

  it("reports an unreachable backend with the configured address", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const { api } = await import("@/lib/api");
    const result = await attempt(api.health());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isUnreachable).toBe(true);
      expect(result.error.message).toContain("backend.test");
    }
  });

  it("does not send an API key header when none is configured", async () => {
    delete process.env.API_KEY;
    const calls: Array<[string, RequestInit]> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push([String(url), init]);
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { api } = await import("@/lib/api");
    await api.health();
    const headers = (calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["X-API-Key"]).toBeUndefined();
    expect(headers["Accept"]).toBe("application/json");
  });

  it("omits empty query parameters rather than sending blanks", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { api } = await import("@/lib/api");
    await api.candles("AAPL", { resolution: "1d" });
    const url = urls[0] ?? "";
    expect(url).toContain("resolution=1d");
    expect(url).not.toContain("start=");
    expect(url).not.toContain("as_of=");
  });
});
