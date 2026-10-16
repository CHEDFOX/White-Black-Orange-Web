/**
 * Types mirroring the backend's response schemas.
 *
 * Fields the backend uses to express uncertainty are modelled as required
 * rather than optional wherever the backend always sends them -- `disclosures`,
 * `limitations`, `unavailable_reason`. That way a component cannot quietly
 * forget to render a caveat: TypeScript makes the field's presence explicit.
 */

export interface InstrumentSummary {
  id: string;
  symbol: string;
  exchange_code: string;
  mic: string | null;
  exchange_name: string | null;
  name: string;
  instrument_type: string;
  currency: string;
  country: string | null;
  is_active: boolean;
  listed_on: string | null;
  delisted_on: string | null;
  isin: string | null;
}

export interface CoverageEntry {
  data_kind: string;
  resolution: string | null;
  source: string;
  first_observation: string | null;
  last_observation: string | null;
  observation_count: number;
  last_refreshed_at: string | null;
  known_gap_count: number;
  notes: string | null;
}

export interface DataFreshness {
  latest_bar: string | null;
  age_days: number | null;
  is_stale: boolean;
  note: string;
}

export interface TickerHistoryEntry {
  symbol: string;
  exchange_code: string | null;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
}

export interface InstrumentDetail extends InstrumentSummary {
  timezone: string;
  calendar_code: string;
  calendar_coverage_note: string;
  issuer_name: string | null;
  sector: string | null;
  industry: string | null;
  cik: string | null;
  website: string | null;
  description: string | null;
  coverage: CoverageEntry[];
  freshness: DataFreshness;
  ticker_history: TickerHistoryEntry[];
  supported_resolutions: string[];
  supported_adjustment_bases: string[];
  analysis_caveats: string[];
}

export interface InstrumentListResponse {
  instruments: InstrumentSummary[];
  returned: number;
  total: number;
  note: string | null;
}

export interface SearchResponse {
  query: string;
  results: InstrumentSummary[];
  returned: number;
  note: string | null;
}

/** OHLCV values arrive as strings to preserve exact decimals. */
export interface Candle {
  t: string;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string | null;
  revision: number;
}

export interface Attribution {
  key: string;
  name: string;
  attribution_required: boolean;
  attribution_text: string | null;
  official_api: boolean;
  redistribution_allowed: boolean;
  classification: string;
  caveats: string | null;
}

export interface DataGap {
  gap_start: string;
  gap_end: string;
  expected_sessions: number;
  reason: string | null;
  filled: boolean;
}

export interface QualityIssue {
  kind: string;
  severity: "info" | "warning" | "error";
  detail: string;
  at: string | null;
  context: Record<string, unknown>;
}

export interface CandleResponse {
  instrument_id: string;
  symbol: string;
  resolution: string;
  adjustment_basis: string;
  currency: string;
  as_of: string;
  candles: Candle[];
  count: number;
  first: string | null;
  last: string | null;
  gaps: DataGap[];
  quality_issues: QualityIssue[];
  coverage_notes: string[];
  attribution: Attribution[];
  freshness: DataFreshness | null;
  aggregated_from: string | null;
  disclosures: string[];
}

export interface LatestPrice {
  instrument_id: string;
  symbol: string;
  price: string | null;
  currency: string;
  at: string | null;
  is_delayed: boolean;
  source: string | null;
  note: string;
}

export interface MethodOutcome {
  key: string;
  version: string;
  display_name: string;
  ok: boolean;
  values: Record<string, unknown>;
  warnings: string[];
  limitations: string[];
  observations_used: number;
  input_fingerprint: string | null;
  params: Record<string, unknown>;
  unavailable_reason: string | null;
  unavailable_code: string | null;
}

export interface AnalysisResponse {
  instrument_id: string;
  symbol: string;
  name: string;
  as_of: string;
  purpose: string;
  resolution: string;
  adjustment_basis: string;
  period_start: string | null;
  period_end: string | null;
  observations: number;
  currency: string;
  methods: Record<string, MethodOutcome>;
  methods_available: string[];
  methods_unavailable: Record<string, string | null>;
  data_sources: string[];
  gaps: DataGap[];
  quality_issues: QualityIssue[];
  coverage_notes: string[];
  benchmark_symbol: string | null;
  benchmark_note: string | null;
  fundamentals_note: string | null;
  disclosures: string[];
}

export type ClaimKind =
  | "observed_fact"
  | "deterministic_calculation"
  | "statistical_relationship"
  | "model_estimate"
  | "causal_hypothesis"
  | "interpretation"
  | "scenario"
  | "unknown";

export interface Calculation {
  label: string;
  value: number | string | null;
  unit: string;
  method_key: string;
  method_version: string;
  observations_used: number;
  input_fingerprint: string | null;
  params: Record<string, unknown>;
}

export interface EvidenceItem {
  stance: "supporting" | "contradicting" | "contextual";
  description: string;
  source_table: string;
  source_row_id: string | null;
  data_source_key: string | null;
  url: string | null;
  published_at: string | null;
  observed_value: string | null;
  detail: Record<string, unknown>;
}

export interface Finding {
  section: string;
  conclusion: string;
  claim_kind: ClaimKind;
  confidence_label: string | null;
  uncertainty: string | null;
  methodology: string | null;
  limitations: string[];
  calculations: Calculation[];
  evidence: EvidenceItem[];
  supporting_count: number;
  contradicting_count: number;
}

export interface ReportResponse {
  instrument_id: string;
  symbol: string;
  name: string;
  report_kind: string;
  title: string;
  summary: string;
  created_at: string;
  information_cutoff: string;
  period_start: string | null;
  period_end: string | null;
  findings: Finding[];
  limitations: string[];
  data_coverage: Record<string, unknown>;
  method_versions: Record<string, string>;
  inputs: Record<string, unknown>;
  attribution: Attribution[];
  narrative: string | null;
  narrative_model: string | null;
  narrative_status: string;
  generator_version: string;
  reproduction_key: string;
  claim_kind_counts: Record<string, number>;
  claim_kind_legend: Record<string, string>;
}

export interface ForecastModel {
  key: string;
  version: string;
  family: string;
  display_name: string;
  description: string;
  target: string;
  supported_horizons: string[];
  min_observations: number;
  is_baseline: boolean;
  lifecycle: string;
  lifecycle_reason: string;
  limitations: string[];
  assumptions: string[];
  invalidation_conditions: string[];
  hyperparameters: Record<string, unknown>;
}

export interface ValidationMetrics {
  model_key: string;
  model_version: string;
  horizon_label: string;
  n_forecasts: number;
  mean_crps: number | null;
  mean_absolute_error: number | null;
  root_mean_squared_error: number | null;
  directional_accuracy: number | null;
  interval_coverage: Record<string, number>;
  pit_uniformity_p: number | null;
  pit_histogram: number[];
  calibration_verdict: string;
  skill_vs_baseline: number | null;
  baseline_key: string | null;
  per_regime: Record<string, Record<string, number>>;
  warnings: string[];
}

export interface ForecastValidation {
  available: boolean;
  reason?: string;
  metrics?: ValidationMetrics;
  execution_assumptions?: Record<string, unknown>;
  limitations?: string[];
  scheme?: string;
  note?: string;
}

export interface ForecastResponse {
  id: string | null;
  instrument_id: string;
  symbol: string;
  model_key: string;
  model_version: string;
  is_baseline: boolean;
  lifecycle: string;
  target: string;
  horizon_label: string;
  horizon_bars: number;
  information_cutoff: string;
  resolves_at: string;
  point_estimate: number | null;
  quantiles: Record<string, number>;
  price_levels: Record<string, number>;
  base_price: number | null;
  prob_positive: number | null;
  predicted_volatility: number | null;
  distribution_family: string;
  contributing_factors: Array<{
    factor: string;
    value: number;
    description: string;
  }>;
  assumptions: string[];
  invalidation_conditions: string[];
  limitations: string[];
  warnings: string[];
  observations_used: number;
  input_fingerprint: string;
  stored: boolean;
  validation: ForecastValidation | null;
  disclaimer: string;
}

export interface ModelComparisonRow {
  model_key: string;
  model_version?: string;
  is_baseline?: boolean;
  lifecycle?: string;
  available: boolean;
  reason?: string;
  metrics?: ValidationMetrics;
  execution_assumptions?: Record<string, unknown>;
  limitations?: string[];
}

export interface ModelComparison {
  instrument_id: string;
  symbol: string;
  horizon: string;
  as_of: string;
  results: ModelComparisonRow[];
  note: string;
}

export interface BubbleSignal {
  key: string;
  display_name: string;
  status: "triggered" | "not_triggered" | "unavailable";
  description: string;
  observed_value: number | null;
  threshold: number | null;
  weight: number;
  intensity: number;
  evidence: string;
  counter_evidence: string;
  unavailable_reason: string;
  limitations: string[];
}

export interface DataSourceInfo {
  key: string;
  display_name: string;
  configured: boolean;
  active: boolean;
  unavailable_reason: string | null;
  kinds: string[];
  resolutions?: string[];
  adjustment_bases?: string[];
  supports_point_in_time: boolean;
  supports_streaming?: boolean;
  official_api: boolean;
  redistribution_allowed: boolean;
  attribution_required: boolean;
  attribution_text: string | null;
  licence_summary: string;
  caveats: string[];
  rate_limit_per_minute?: number | null;
  classification: string | null;
  registered: boolean;
  probe?: {
    healthy: boolean;
    latency_ms?: number | null;
    status_code?: number | null;
    detail?: string | null;
    checked_at?: string;
  };
}

export interface PlatformLimitations {
  data: string[];
  analysis: string[];
  forecasting: string[];
  bubble: string[];
  regulatory: string[];
}

export interface ApiError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}
