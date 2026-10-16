/**
 * Server-side backend client.
 *
 * Every call runs on the server. The browser never learns the backend's
 * address and never holds an API key, which is the whole reason the app proxies
 * rather than letting the client call the backend directly.
 *
 * `ApiFailure` carries the backend's own explanation through to the UI. That
 * matters more here than in most apps: a 409 `insufficient_data` is not an
 * error to hide behind "something went wrong" -- it is the platform correctly
 * declining to compute a statistic, and the message says exactly what was
 * missing.
 */

import type {
  AnalysisResponse,
  CandleResponse,
  DataSourceInfo,
  ForecastModel,
  ForecastResponse,
  InstrumentDetail,
  InstrumentListResponse,
  LatestPrice,
  ModelComparison,
  PlatformLimitations,
  ReportResponse,
  SearchResponse,
} from "./types";

const DEFAULT_BASE = "http://localhost:8000/api/v1";

function baseUrl(): string {
  return process.env.API_BASE_URL ?? DEFAULT_BASE;
}

function timeoutMs(): number {
  const raw = process.env.API_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  // Analysis and walk-forward endpoints legitimately take tens of seconds.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /**
   * True when the backend declined because the data does not support the
   * request. Callers render this as an explanation, not as a failure.
   */
  get isInsufficientData(): boolean {
    return this.code === "insufficient_data" || this.status === 409;
  }

  get isNotFound(): boolean {
    return this.code === "not_found" || this.status === 404;
  }

  get isUnreachable(): boolean {
    return this.status === 0;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(baseUrl().replace(/\/$/, "") + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(
  path: string,
  options: { query?: Query; method?: string; body?: unknown; revalidate?: number } = {},
): Promise<T> {
  const { query, method = "GET", body, revalidate = 0 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const apiKey = process.env.API_KEY;
  if (apiKey) headers["X-API-Key"] = apiKey;

  try {
    const response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      // Analysis results depend on an information cutoff, so caching a
      // response under a stale window would show a figure that no longer
      // matches its stated inputs.
      next: revalidate > 0 ? { revalidate } : { revalidate: 0 },
    });

    const text = await response.text();
    const payload: unknown = text ? safeJson(text) : null;

    if (!response.ok) {
      const parsed =
        payload && typeof payload === "object"
          ? (payload as { code?: string; message?: string; details?: Record<string, unknown> })
          : {};
      throw new ApiFailure(
        response.status,
        parsed.code ?? `http_${response.status}`,
        parsed.message ?? `The backend returned ${response.status}.`,
        parsed.details ?? {},
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiFailure(
        504,
        "timeout",
        `The backend did not respond within ${timeoutMs() / 1000}s. Analysis ` +
          `over a long window can exceed this; try a shorter period.`,
      );
    }
    throw new ApiFailure(
      0,
      "backend_unreachable",
      `Could not reach the backend at ${baseUrl()}. Is it running? ` +
        `Set API_BASE_URL if it is on another host.`,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

/** Resolve a promise to a value or the failure, so a page can render both. */
export async function attempt<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: ApiFailure }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    if (error instanceof ApiFailure) return { ok: false, error };
    throw error;
  }
}

export const api = {
  listInstruments(opts: { onlyWithPrices?: boolean; limit?: number; type?: string } = {}) {
    return request<InstrumentListResponse>("/instruments", {
      query: {
        only_with_prices: opts.onlyWithPrices ?? true,
        limit: opts.limit ?? 100,
        instrument_type: opts.type,
      },
    });
  },

  searchInstruments(query: string, opts: { onlyWithPrices?: boolean; limit?: number } = {}) {
    return request<SearchResponse>("/instruments/search", {
      query: {
        q: query,
        only_with_prices: opts.onlyWithPrices ?? true,
        limit: opts.limit ?? 20,
      },
    });
  },

  instrument(identifier: string, asOf?: string) {
    return request<InstrumentDetail>(`/instruments/${encodeURIComponent(identifier)}`, {
      query: { as_of: asOf },
    });
  },

  candles(
    identifier: string,
    opts: {
      start?: string;
      end?: string;
      resolution?: string;
      adjustmentBasis?: string;
      asOf?: string;
      limit?: number;
    } = {},
  ) {
    return request<CandleResponse>(
      `/market-data/${encodeURIComponent(identifier)}/candles`,
      {
        query: {
          start: opts.start,
          end: opts.end,
          resolution: opts.resolution ?? "1d",
          adjustment_basis: opts.adjustmentBasis ?? "total_return",
          as_of: opts.asOf,
          limit: opts.limit,
        },
      },
    );
  },

  latest(identifier: string) {
    return request<LatestPrice>(`/market-data/${encodeURIComponent(identifier)}/latest`);
  },

  pastAnalysis(
    identifier: string,
    opts: { start: string; end: string; adjustmentBasis?: string; benchmark?: string },
  ) {
    return request<AnalysisResponse>(`/analysis/${encodeURIComponent(identifier)}/past`, {
      query: {
        start: opts.start,
        end: opts.end,
        adjustment_basis: opts.adjustmentBasis,
        benchmark: opts.benchmark,
      },
    });
  },

  presentAnalysis(identifier: string, opts: { lookbackDays?: number; benchmark?: string } = {}) {
    return request<AnalysisResponse>(`/analysis/${encodeURIComponent(identifier)}/present`, {
      query: { lookback_days: opts.lookbackDays ?? 365, benchmark: opts.benchmark },
    });
  },

  statisticalAnalysis(identifier: string, lookbackDays = 1095) {
    return request<AnalysisResponse>(
      `/analysis/${encodeURIComponent(identifier)}/statistical`,
      { query: { lookback_days: lookbackDays } },
    );
  },

  fundamentals(identifier: string, asOf?: string) {
    return request<AnalysisResponse>(
      `/analysis/${encodeURIComponent(identifier)}/fundamentals`,
      { query: { as_of: asOf } },
    );
  },

  risk(identifier: string, opts: { lookbackDays?: number; targetVol?: number } = {}) {
    return request<AnalysisResponse>(`/analysis/${encodeURIComponent(identifier)}/risk`, {
      query: {
        lookback_days: opts.lookbackDays ?? 730,
        target_annual_volatility: opts.targetVol,
      },
    });
  },

  bubble(identifier: string, lookbackDays = 1095) {
    return request<AnalysisResponse>(`/analysis/${encodeURIComponent(identifier)}/bubble`, {
      query: { lookback_days: lookbackDays },
    });
  },

  tradeStructure(
    identifier: string,
    body: {
      direction: string;
      entry?: number | null;
      stop_atr_multiple: number;
      target_atr_multiples: number[];
      account_value?: number | null;
      account_risk_fraction: number;
    },
  ) {
    return request<AnalysisResponse>(
      `/analysis/${encodeURIComponent(identifier)}/trade-structure`,
      { method: "POST", body },
    );
  },

  forecastModels() {
    return request<ForecastModel[]>("/forecasts/models", { revalidate: 300 });
  },

  forecast(
    identifier: string,
    body: { model_key: string; horizon: string; lookback_days?: number; include_validation?: boolean },
  ) {
    return request<ForecastResponse>(`/forecasts/${encodeURIComponent(identifier)}`, {
      method: "POST",
      body: { include_validation: true, ...body },
    });
  },

  compareModels(identifier: string, horizon: string, lookbackDays = 1825) {
    return request<ModelComparison>(
      `/forecasts/${encodeURIComponent(identifier)}/compare`,
      { query: { horizon, lookback_days: lookbackDays } },
    );
  },

  historicalReport(
    identifier: string,
    opts: { start: string; end: string; benchmark?: string; includeNarrative?: boolean },
  ) {
    return request<ReportResponse>(`/reports/${encodeURIComponent(identifier)}/historical`, {
      query: {
        start: opts.start,
        end: opts.end,
        benchmark: opts.benchmark,
        include_narrative: opts.includeNarrative ?? false,
      },
    });
  },

  currentReport(
    identifier: string,
    opts: { lookbackDays?: number; benchmark?: string; includeNarrative?: boolean } = {},
  ) {
    return request<ReportResponse>(`/reports/${encodeURIComponent(identifier)}/current`, {
      query: {
        lookback_days: opts.lookbackDays ?? 365,
        benchmark: opts.benchmark,
        include_narrative: opts.includeNarrative ?? false,
      },
    });
  },

  dataSources(probe = false) {
    return request<{ sources: DataSourceInfo[]; configured_order: string[]; note: string }>(
      "/data-sources",
      { query: { probe }, revalidate: probe ? 0 : 60 },
    );
  },

  limitations() {
    return request<PlatformLimitations>("/limitations", { revalidate: 3600 });
  },

  methods() {
    return request<{
      methods: Array<Record<string, unknown>>;
      count: number;
      families: Record<string, number>;
    }>("/methods", { revalidate: 300 });
  },

  health() {
    return request<{
      status: string;
      environment: string;
      database: string;
      instruments: number;
      price_bars: number;
      checked_at: string;
    }>("/health");
  },
};
