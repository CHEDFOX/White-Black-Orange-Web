import type { Metadata } from "next";

import { MethodTable } from "@/components/MethodTable";
import { PeriodPicker } from "@/components/PeriodPicker";
import { PriceChart } from "@/components/PriceChart";
import {
  AttributionLine,
  Badge,
  Card,
  Disclosures,
  ErrorPanel,
  Metric,
  MethodBlock,
  Notice,
  QualityIssues,
} from "@/components/ui";
import { api, attempt } from "@/lib/api";
import {
  formatDate,
  formatNumber,
  formatPercent,
  formatPrice,
  humanise,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol)} historical analysis` };
}

const DEFAULT_START = "2022-01-01";
const DEFAULT_END = "2022-12-31";

export default async function PastPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { symbol } = await params;
  const { start: startParam, end: endParam } = await searchParams;
  const decoded = decodeURIComponent(symbol);
  const start = startParam ?? DEFAULT_START;
  const end = endParam ?? DEFAULT_END;
  const base = `/instrument/${encodeURIComponent(decoded)}/past`;

  const [analysis, candles] = await Promise.all([
    attempt(
      api.pastAnalysis(decoded, {
        start: `${start}T00:00:00Z`,
        end: `${end}T23:59:59Z`,
      }),
    ),
    attempt(
      api.candles(decoded, {
        start: `${start}T00:00:00Z`,
        end: `${end}T23:59:59Z`,
        asOf: `${end}T23:59:59Z`,
      }),
    ),
  ]);

  return (
    <div className="stack">
      <Card
        title="Choose a historical period"
        subtitle="The end date is the analysis cutoff: nothing published after it is used."
      >
        <PeriodPicker basePath={base} start={start} end={end} />
      </Card>

      {!analysis.ok ? (
        <ErrorPanel
          title={
            analysis.error.isInsufficientData
              ? "Not enough data for this period"
              : "Could not analyse this period"
          }
          message={analysis.error.message}
          details={analysis.error.details}
          hint={
            analysis.error.isInsufficientData
              ? "Pick a longer window, or check what history is ingested on the Overview tab."
              : undefined
          }
        />
      ) : (
        <>
          <Card
            title={`${formatDate(analysis.value.period_start)} → ${formatDate(analysis.value.period_end)}`}
            subtitle={`${analysis.value.observations} bars · ${analysis.value.adjustment_basis} basis · cutoff ${formatDate(analysis.value.as_of)}`}
            action={<Badge variant="info">point-in-time reconstruction</Badge>}
          >
            <HeadlineMetrics analysis={analysis.value} />
          </Card>

          {candles.ok && candles.value.candles.length > 0 && (
            <Card title="What the price did" subtitle="Only bars available at the cutoff">
              <PriceChart
                candles={candles.value.candles}
                currency={candles.value.currency}
                gaps={candles.value.gaps}
                ariaLabel={`${decoded} candlestick chart for ${start} to ${end}`}
              />
              <AttributionLine sources={candles.value.attribution} />
              <div className="mt-1">
                <QualityIssues issues={candles.value.quality_issues} />
              </div>
            </Card>
          )}

          <div className="grid grid-2">
            <Card title="Return and risk over the period">
              <MethodBlock outcome={analysis.value.methods["returns"]}>
                <MethodTable
                  outcome={analysis.value.methods["returns"]}
                  fields={[
                    { key: "total_return", label: "Total return", format: (v) => formatPercent(v as number, 2, { withSign: true }) },
                    { key: "annualised_return", label: "Annualised", format: (v) => formatPercent(v as number, 2, { withSign: true }), note: "extremely noisy over a short window" },
                    { key: "first_close", label: "First close", format: (v) => formatPrice(v as number, analysis.value.currency) },
                    { key: "last_close", label: "Last close", format: (v) => formatPrice(v as number, analysis.value.currency) },
                    { key: "periods", label: "Periods", format: (v) => String(v) },
                  ]}
                />
              </MethodBlock>
              <div className="mt-2">
                <MethodBlock outcome={analysis.value.methods["realized_volatility"]}>
                  <MethodTable
                    outcome={analysis.value.methods["realized_volatility"]}
                    fields={[
                      { key: "annualised_volatility", label: "Annualised volatility", format: (v) => formatPercent(v as number, 1) },
                      { key: "daily_volatility", label: "Per-bar volatility", format: (v) => formatPercent(v as number, 2) },
                      { key: "periods_per_year_assumed", label: "Periods per year assumed", format: (v) => String(v) },
                    ]}
                  />
                </MethodBlock>
              </div>
            </Card>

            <Card title="Drawdown">
              <MethodBlock outcome={analysis.value.methods["drawdown"]}>
                <MethodTable
                  outcome={analysis.value.methods["drawdown"]}
                  fields={[
                    { key: "max_drawdown", label: "Maximum drawdown", format: (v) => formatPercent(v as number, 2) },
                    { key: "peak_close", label: "Peak close", format: (v) => formatPrice(v as number) },
                    { key: "peak_date", label: "Peak date", format: (v) => String(v).slice(0, 10) },
                    { key: "trough_close", label: "Trough close", format: (v) => formatPrice(v as number) },
                    { key: "trough_date", label: "Trough date", format: (v) => String(v).slice(0, 10) },
                    { key: "current_drawdown", label: "At period end", format: (v) => formatPercent(v as number, 2) },
                    { key: "recovered", label: "Recovered by period end", format: (v) => (v ? "yes" : "no") },
                  ]}
                />
              </MethodBlock>
            </Card>

            <Card title="Trend and regime">
              <MethodBlock outcome={analysis.value.methods["regime_classification"]}>
                <RegimeBlock analysis={analysis.value} />
              </MethodBlock>
              <div className="mt-2">
                <MethodBlock outcome={analysis.value.methods["trend_strength"]}>
                  <MethodTable
                    outcome={analysis.value.methods["trend_strength"]}
                    fields={[
                      { key: "annualised_slope", label: "Fitted trend", format: (v) => formatPercent(v as number, 1, { withSign: true }), note: "per year, from an OLS fit on log price" },
                      { key: "r_squared", label: "R-squared of the fit", format: (v) => formatNumber(v as number, 3) },
                      { key: "up_period_fraction", label: "Up periods", format: (v) => formatPercent(v as number, 1) },
                    ]}
                  />
                </MethodBlock>
              </div>
            </Card>

            <Card
              title="Against the benchmark"
              subtitle={analysis.value.benchmark_symbol ?? "no benchmark"}
            >
              {analysis.value.benchmark_note && (
                <Notice variant="warn">{analysis.value.benchmark_note}</Notice>
              )}
              <MethodBlock outcome={analysis.value.methods["relative_strength"]}>
                <MethodTable
                  outcome={analysis.value.methods["relative_strength"]}
                  fields={[
                    { key: "asset_return", label: `${decoded} return`, format: (v) => formatPercent(v as number, 2, { withSign: true }) },
                    { key: "benchmark_return", label: "Benchmark return", format: (v) => formatPercent(v as number, 2, { withSign: true }) },
                    { key: "excess_return", label: "Excess return", format: (v) => formatPercent(v as number, 2, { withSign: true }) },
                    { key: "beta", label: "Beta", format: (v) => formatNumber(v as number, 3), note: "in-sample over this window only" },
                    { key: "alpha_annualised", label: "Alpha (annualised)", format: (v) => formatPercent(v as number, 2, { withSign: true }), note: "a residual, not evidence of skill" },
                    { key: "correlation", label: "Return correlation", format: (v) => formatNumber(v as number, 3) },
                    { key: "r_squared", label: "R-squared", format: (v) => formatNumber(v as number, 3) },
                  ]}
                />
              </MethodBlock>
            </Card>
          </div>

          <Card title="Return distribution over the period">
            <MethodBlock outcome={analysis.value.methods["return_distribution"]}>
              <DistributionBlock analysis={analysis.value} />
            </MethodBlock>
          </Card>

          <div className="grid grid-2">
            <Card title="Participation">
              <MethodBlock outcome={analysis.value.methods["volume_profile"]}>
                <MethodTable
                  outcome={analysis.value.methods["volume_profile"]}
                  fields={[
                    { key: "mean_volume", label: "Average volume", format: (v) => formatNumber(v as number, 0) },
                    { key: "recent_volume_ratio", label: "Recent vs baseline", format: (v) => `${formatNumber(v as number, 2)}×` },
                    { key: "volume_return_correlation", label: "Volume vs |return| correlation", format: (v) => formatNumber(v as number, 3), note: "a positive value is expected and is not evidence of informed trading" },
                  ]}
                />
              </MethodBlock>
            </Card>

            <Card title="Overnight gaps">
              <MethodBlock outcome={analysis.value.methods["gap_analysis"]}>
                <MethodTable
                  outcome={analysis.value.methods["gap_analysis"]}
                  fields={[
                    { key: "largest_gap_down", label: "Largest gap down", format: (v) => formatPercent(v as number, 2) },
                    { key: "largest_gap_up", label: "Largest gap up", format: (v) => formatPercent(v as number, 2, { withSign: true }) },
                    { key: "mean_absolute_gap", label: "Average absolute gap", format: (v) => formatPercent(v as number, 2) },
                    { key: "significant_gap_count", label: "Gaps beyond threshold", format: (v) => String(v) },
                    { key: "gap_fill_rate", label: "Filled same session", format: (v) => formatPercent(v as number, 0), note: "a historical frequency, not a probability" },
                  ]}
                />
              </MethodBlock>
            </Card>
          </div>

          <Card title="Did the period's behaviour change part-way through?">
            <MethodBlock outcome={analysis.value.methods["change_point"]}>
              <MethodTable
                outcome={analysis.value.methods["change_point"]}
                fields={[
                  { key: "change_point_date", label: "Best split point", format: (v) => String(v).slice(0, 10) },
                  { key: "volatility_before", label: "Volatility before", format: (v) => formatPercent(v as number, 2) },
                  { key: "volatility_after", label: "Volatility after", format: (v) => formatPercent(v as number, 2) },
                  { key: "variance_ratio", label: "Variance ratio", format: (v) => `${formatNumber(v as number, 2)}×` },
                  { key: "f_test_p_bonferroni", label: "Corrected p-value", format: (v) => formatNumber(v as number, 4), note: "corrected for every candidate split searched; the uncorrected value is not reportable" },
                  { key: "candidate_splits_searched", label: "Splits searched", format: (v) => String(v) },
                ]}
              />
            </MethodBlock>
          </Card>

          <Card title="What this reconstruction does and does not show">
            <Disclosures items={analysis.value.disclosures} open />
            {Object.keys(analysis.value.methods_unavailable).length > 0 && (
              <div className="mt-2">
                <h4>Questions this period could not answer</h4>
                <ul className="disclosure-list">
                  {Object.entries(analysis.value.methods_unavailable).map(
                    ([key, reason]) => (
                      <li key={key}>
                        <strong>{humanise(key)}:</strong> {reason}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </Card>

          <Notice variant="brand" title="On explanation versus description">
            Everything above describes what the price did. It does not explain
            why. An event occurring before a price movement is not evidence
            that it caused it, so the platform reports the two separately and
            labels any proposed cause as a hypothesis. See the{" "}
            <a href={`/instrument/${encodeURIComponent(decoded)}/report?start=${start}&end=${end}`}>
              evidence-linked report
            </a>{" "}
            for findings with their supporting and contradicting evidence.
          </Notice>
        </>
      )}
    </div>
  );
}

function HeadlineMetrics({
  analysis,
}: {
  analysis: Awaited<ReturnType<typeof api.pastAnalysis>>;
}) {
  const returns = analysis.methods["returns"];
  const vol = analysis.methods["realized_volatility"];
  const dd = analysis.methods["drawdown"];
  const rel = analysis.methods["relative_strength"];

  const total = returns?.ok ? (returns.values["total_return"] as number) : null;
  const annualVol = vol?.ok ? (vol.values["annualised_volatility"] as number) : null;
  const maxDd = dd?.ok ? (dd.values["max_drawdown"] as number) : null;
  const excess = rel?.ok ? (rel.values["excess_return"] as number) : null;

  return (
    <div className="grid grid-4">
      <Metric
        label="Period return"
        value={total === null ? null : formatPercent(total, 2, { withSign: true })}
        tone={total === null ? undefined : total >= 0 ? "up" : "down"}
        missingReason={returns?.unavailable_reason ?? undefined}
      />
      <Metric
        label="Annualised volatility"
        value={annualVol === null ? null : formatPercent(annualVol, 1)}
        missingReason={vol?.unavailable_reason ?? undefined}
      />
      <Metric
        label="Max drawdown"
        value={maxDd === null ? null : formatPercent(maxDd, 1)}
        tone={maxDd === null ? undefined : "down"}
        missingReason={dd?.unavailable_reason ?? undefined}
      />
      <Metric
        label={`Excess vs ${analysis.benchmark_symbol ?? "benchmark"}`}
        value={excess === null ? null : formatPercent(excess, 2, { withSign: true })}
        tone={excess === null ? undefined : excess >= 0 ? "up" : "down"}
        missingReason={rel?.unavailable_reason ?? analysis.benchmark_note ?? undefined}
      />
    </div>
  );
}

function RegimeBlock({
  analysis,
}: {
  analysis: Awaited<ReturnType<typeof api.pastAnalysis>>;
}) {
  const regime = analysis.methods["regime_classification"];
  if (!regime?.ok) return null;
  const label = String(regime.values["label"] ?? "indeterminate");
  const confidence = regime.values["confidence"] as number | null;
  const probabilities = (regime.values["label_probabilities"] ?? {}) as Record<string, number>;

  return (
    <div>
      <div className="row">
        <Badge variant="warn">model estimate</Badge>
        <strong>{humanise(label)}</strong>
        <span className="subtle small">
          confidence {formatNumber(confidence, 2)}
        </span>
      </div>
      <p className="small muted mt-1">
        This is one rule&apos;s classification, not an observed property of the
        market. A different rule or threshold would disagree near the
        boundaries.
      </p>
      {Object.keys(probabilities).length > 1 && (
        <table className="data mt-1">
          <tbody>
            {Object.entries(probabilities)
              .sort((a, b) => b[1] - a[1])
              .map(([key, value]) => (
                <tr key={key}>
                  <th style={{ textTransform: "none", fontSize: "0.8125rem" }}>
                    {humanise(key)}
                  </th>
                  <td className="num mono">{formatPercent(value, 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DistributionBlock({
  analysis,
}: {
  analysis: Awaited<ReturnType<typeof api.pastAnalysis>>;
}) {
  const dist = analysis.methods["return_distribution"];
  if (!dist?.ok) return null;
  const quantiles = (dist.values["quantiles"] ?? {}) as Record<string, number>;
  const rejected = dist.values["normality_rejected_at_5pct"] as boolean | null;

  return (
    <div>
      <div className="grid grid-4">
        <Metric
          label="Mean per-bar return"
          value={formatPercent(dist.values["mean"] as number, 3, { withSign: true })}
        />
        <Metric
          label="Standard deviation"
          value={formatPercent(dist.values["std_dev"] as number, 2)}
        />
        <Metric
          label="Skewness"
          value={formatNumber(dist.values["skewness"] as number, 2)}
          note="needs hundreds of observations to mean much"
        />
        <Metric
          label="Excess kurtosis"
          value={formatNumber(dist.values["excess_kurtosis"] as number, 2)}
          note="0 is Gaussian; higher means fatter tails"
        />
      </div>

      {rejected !== null && (
        <Notice variant={rejected ? "warn" : "info"} title={rejected ? "Returns are not normally distributed" : "Normality is not rejected"}>
          {rejected ? (
            <>
              A Jarque-Bera test rejects normality at the 5% level, so any
              interval derived from the standard deviation alone understates the
              chance of a large move. The test says the distribution is not
              normal; it does not say what it is instead.
            </>
          ) : (
            <>
              A Jarque-Bera test does not reject normality in this window. That
              is not evidence that returns <em>are</em> normal, only that this
              sample does not contradict it.
            </>
          )}
        </Notice>
      )}

      {Object.keys(quantiles).length > 0 && (
        <details className="expand mt-2">
          <summary>Empirical return quantiles</summary>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Quantile</th>
                  <th className="num">Per-bar return</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(quantiles)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([q, value]) => (
                    <tr key={q}>
                      <td className="mono">{(Number(q) * 100).toFixed(0)}%</td>
                      <td className="num mono">
                        {formatPercent(value, 2, { withSign: true })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="tiny subtle mt-1">
            Empirical quantiles cannot describe the tail beyond the observed
            sample: a one-in-500 loss is invisible in 250 observations.
          </p>
        </details>
      )}
    </div>
  );
}
