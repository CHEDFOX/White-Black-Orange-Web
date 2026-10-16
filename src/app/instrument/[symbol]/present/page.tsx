import type { Metadata } from "next";

import { AllValues, MethodTable } from "@/components/MethodTable";
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
} from "@/components/ui";
import { api, attempt } from "@/lib/api";
import {
  daysBefore,
  formatDate,
  formatNumber,
  formatPercent,
  formatPrice,
  humanise,
  todayIso,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol)} current analysis` };
}

export default async function PresentPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ lookback?: string }>;
}) {
  const { symbol } = await params;
  const { lookback } = await searchParams;
  const decoded = decodeURIComponent(symbol);
  const lookbackDays = Number.parseInt(lookback ?? "400", 10) || 400;

  const [analysis, candles, statistical] = await Promise.all([
    attempt(api.presentAnalysis(decoded, { lookbackDays })),
    attempt(
      api.candles(decoded, {
        start: `${daysBefore(lookbackDays)}T00:00:00Z`,
        end: `${todayIso()}T23:59:59Z`,
      }),
    ),
    attempt(api.statisticalAnalysis(decoded, Math.max(lookbackDays, 1095))),
  ]);

  if (!analysis.ok) {
    return (
      <ErrorPanel
        title={
          analysis.error.isInsufficientData
            ? "Not enough data for a current analysis"
            : "Could not run the current analysis"
        }
        message={analysis.error.message}
        details={analysis.error.details}
      />
    );
  }

  const data = analysis.value;
  const bands = data.methods["bollinger_bands"];
  const sr = data.methods["support_resistance"];

  return (
    <div className="stack">
      <Card
        title="Current situation"
        subtitle={`${data.observations} bars to ${formatDate(data.period_end)} · ${data.adjustment_basis} basis`}
        action={<Badge variant="info">as of the last completed session</Badge>}
      >
        <div className="grid grid-4">
          <Metric
            label="Window return"
            value={formatPercent(data.methods["returns"]?.values["total_return"] as number, 2, { withSign: true })}
            tone={((data.methods["returns"]?.values["total_return"] as number) ?? 0) >= 0 ? "up" : "down"}
            missingReason={data.methods["returns"]?.unavailable_reason ?? undefined}
          />
          <Metric
            label="Annualised volatility"
            value={formatPercent(data.methods["realized_volatility"]?.values["annualised_volatility"] as number, 1)}
            missingReason={data.methods["realized_volatility"]?.unavailable_reason ?? undefined}
          />
          <Metric
            label="From running peak"
            value={formatPercent(data.methods["drawdown"]?.values["current_drawdown"] as number, 1)}
            tone="down"
            missingReason={data.methods["drawdown"]?.unavailable_reason ?? undefined}
          />
          <Metric
            label="ATR as % of price"
            value={formatPercent(data.methods["atr"]?.values["atr_percent"] as number, 2)}
            missingReason={data.methods["atr"]?.unavailable_reason ?? undefined}
            note="typical daily range"
          />
        </div>
      </Card>

      {candles.ok && (
        <Card title="Recent price action">
          <PriceChart
            candles={candles.value.candles}
            currency={candles.value.currency}
            gaps={candles.value.gaps}
            ariaLabel={`${decoded} recent candlestick chart`}
          />
          <AttributionLine sources={candles.value.attribution} />
        </Card>
      )}

      <div className="grid grid-2">
        <Card title="Trend across horizons">
          <MethodBlock outcome={data.methods["moving_averages"]}>
            <MovingAverages analysis={data} />
          </MethodBlock>
          <Notice variant="info" title="On moving averages">
            These lag by construction. A crossover describes the past; it is not
            a signal with established predictive value, and the popular windows
            (50, 200) have no special statistical standing.
          </Notice>
        </Card>

        <Card title="Momentum">
          <MethodBlock outcome={data.methods["rsi"]}>
            <MethodTable
              outcome={data.methods["rsi"]}
              fields={[
                { key: "rsi", label: "RSI (Wilder)", format: (v) => formatNumber(v as number, 1) },
                { key: "average_gain", label: "Average gain", format: (v) => formatNumber(v as number, 4) },
                { key: "average_loss", label: "Average loss", format: (v) => formatNumber(v as number, 4) },
              ]}
            />
          </MethodBlock>
          <div className="mt-2">
            <MethodBlock outcome={data.methods["macd"]}>
              <MethodTable
                outcome={data.methods["macd"]}
                fields={[
                  { key: "macd", label: "MACD line", format: (v) => formatNumber(v as number, 3) },
                  { key: "signal", label: "Signal line", format: (v) => formatNumber(v as number, 3) },
                  { key: "histogram", label: "Histogram", format: (v) => formatNumber(v as number, 3) },
                ]}
              />
            </MethodBlock>
          </div>
          <p className="tiny subtle mt-1">
            RSI uses Wilder smoothing (alpha = 1/period). Platforms using a
            standard EMA report different values for the same series, so these
            figures may not reconcile with another tool.
          </p>
        </Card>

        <Card title="Dispersion">
          <MethodBlock outcome={bands}>
            <MethodTable
              outcome={bands}
              fields={[
                { key: "upper", label: "Upper band", format: (v) => formatPrice(v as number, data.currency) },
                { key: "middle", label: "Middle (moving average)", format: (v) => formatPrice(v as number, data.currency) },
                { key: "lower", label: "Lower band", format: (v) => formatPrice(v as number, data.currency) },
                { key: "percent_b", label: "%B (position in band)", format: (v) => formatPercent(v as number, 0) },
                { key: "bandwidth", label: "Bandwidth", format: (v) => formatPercent(v as number, 2) },
              ]}
            />
          </MethodBlock>
          <p className="tiny subtle mt-1">
            The bands describe recent dispersion of price, not a probability
            range. Price distributions are fat-tailed, so the nominal 95%
            coverage of two standard deviations does not hold.
          </p>
        </Card>

        <Card title="Levels the market has reacted to">
          <MethodBlock outcome={sr}>
            <LevelsTable analysis={data} />
          </MethodBlock>
        </Card>
      </div>

      <Card title="Regime estimate">
        <MethodBlock outcome={data.methods["regime_classification"]}>
          <div className="row">
            <Badge variant="warn">model estimate</Badge>
            <strong>
              {humanise(String(data.methods["regime_classification"]?.values["label"] ?? ""))}
            </strong>
            <span className="subtle small">
              confidence{" "}
              {formatNumber(
                data.methods["regime_classification"]?.values["confidence"] as number,
                2,
              )}
            </span>
          </div>
          <AllValues outcome={data.methods["regime_classification"]} />
        </MethodBlock>
      </Card>

      {statistical.ok && (
        <Card
          title="Statistical diagnostics"
          subtitle="Whether past returns carry information about the next one"
        >
          <div className="grid grid-2">
            <div>
              <h4>Autocorrelation</h4>
              <MethodBlock outcome={statistical.value.methods["autocorrelation"]}>
                <MethodTable
                  outcome={statistical.value.methods["autocorrelation"]}
                  fields={[
                    { key: "ljung_box_p", label: "Ljung-Box p-value", format: (v) => formatNumber(v as number, 4), note: "one joint test, rather than many single-lag tests" },
                    { key: "joint_independence_rejected_at_5pct", label: "Independence rejected at 5%", format: (v) => (v ? "yes" : "no") },
                    { key: "confidence_band", label: "95% band for a single lag", format: (v) => `±${formatNumber(v as number, 3)}` },
                  ]}
                />
              </MethodBlock>
            </div>
            <div>
              <h4>Volatility clustering</h4>
              <MethodBlock outcome={statistical.value.methods["volatility_clustering"]}>
                <MethodTable
                  outcome={statistical.value.methods["volatility_clustering"]}
                  fields={[
                    { key: "arch_lm_p", label: "ARCH LM p-value", format: (v) => formatNumber(v as number, 4) },
                    { key: "arch_effects_present_at_5pct", label: "Clustering detected", format: (v) => (v ? "yes" : "no") },
                    { key: "abs_return_autocorr_lag1", label: "|return| autocorrelation", format: (v) => formatNumber(v as number, 3) },
                  ]}
                />
              </MethodBlock>
            </div>
            <div>
              <h4>Stationarity</h4>
              <MethodBlock outcome={statistical.value.methods["stationarity"]}>
                <MethodTable
                  outcome={statistical.value.methods["stationarity"]}
                  fields={[
                    { key: "price_adf_p", label: "ADF p-value on log price", format: (v) => formatNumber(v as number, 4) },
                    { key: "returns_adf_p", label: "ADF p-value on returns", format: (v) => formatNumber(v as number, 4) },
                    { key: "returns_stationary", label: "Returns stationary", format: (v) => (v ? "yes" : "no") },
                  ]}
                />
              </MethodBlock>
            </div>
            <div>
              <h4>Calendar seasonality</h4>
              <MethodBlock outcome={statistical.value.methods["seasonality"]}>
                <MethodTable
                  outcome={statistical.value.methods["seasonality"]}
                  fields={[
                    { key: "tests_performed", label: "Calendar buckets tested", format: (v) => String(v) },
                    { key: "min_corrected_p", label: "Best corrected p-value", format: (v) => formatNumber(v as number, 4) },
                    { key: "any_survives_correction", label: "Any effect survives correction", format: (v) => (v ? "yes" : "no") },
                  ]}
                />
              </MethodBlock>
              <p className="tiny subtle mt-1">
                With seventeen calendar buckets something always looks
                significant before correction. Only the corrected verdict is
                reportable.
              </p>
            </div>
          </div>
          <div className="mt-2">
            <Disclosures
              items={statistical.value.disclosures}
              title="Notes on these diagnostics"
            />
          </div>
        </Card>
      )}

      <Card title="What this analysis does and does not show">
        <Disclosures items={data.disclosures} open />
      </Card>
    </div>
  );
}

function MovingAverages({
  analysis,
}: {
  analysis: Awaited<ReturnType<typeof api.presentAnalysis>>;
}) {
  const ma = analysis.methods["moving_averages"];
  if (!ma?.ok) return null;
  const sma = (ma.values["sma"] ?? {}) as Record<string, number | null>;
  const ema = (ma.values["ema"] ?? {}) as Record<string, number | null>;
  const vsSma = (ma.values["price_vs_sma"] ?? {}) as Record<string, number | null>;
  const windows = Object.keys(sma).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Window</th>
            <th className="num">SMA</th>
            <th className="num">EMA</th>
            <th className="num">Price vs SMA</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((window) => {
            const position = vsSma[window];
            return (
              <tr key={window}>
                <td className="mono">{window}</td>
                <td className="num mono">
                  {sma[window] === null || sma[window] === undefined ? (
                    <span className="subtle">window exceeds history</span>
                  ) : (
                    formatPrice(sma[window] as number, analysis.currency)
                  )}
                </td>
                <td className="num mono">
                  {ema[window] === null || ema[window] === undefined
                    ? "—"
                    : formatPrice(ema[window] as number)}
                </td>
                <td
                  className={`num mono ${
                    position === null || position === undefined
                      ? ""
                      : position >= 0
                        ? "up"
                        : "down"
                  }`}
                >
                  {position === null || position === undefined
                    ? "—"
                    : formatPercent(position, 2, { withSign: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LevelsTable({
  analysis,
}: {
  analysis: Awaited<ReturnType<typeof api.presentAnalysis>>;
}) {
  const sr = analysis.methods["support_resistance"];
  if (!sr?.ok) return null;
  type Level = { level: number; touches: number; low: number; high: number };
  const resistance = (sr.values["resistance"] ?? []) as Level[];
  const support = (sr.values["support"] ?? []) as Level[];

  if (!resistance.length && !support.length) {
    return (
      <p className="small muted">
        No clustered swing levels were found with the current lookback and
        tolerance.
      </p>
    );
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Level</th>
              <th className="num">Touches</th>
            </tr>
          </thead>
          <tbody>
            {resistance.map((level, i) => (
              <tr key={`r${i}`}>
                <td>
                  <Badge variant="down">resistance</Badge>
                </td>
                <td className="num mono">
                  {formatPrice(level.level, analysis.currency)}
                </td>
                <td className="num mono">{level.touches}</td>
              </tr>
            ))}
            {support.map((level, i) => (
              <tr key={`s${i}`}>
                <td>
                  <Badge variant="up">support</Badge>
                </td>
                <td className="num mono">
                  {formatPrice(level.level, analysis.currency)}
                </td>
                <td className="num mono">{level.touches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny subtle mt-1">
        These are descriptive clusters of past pivots, not levels with
        demonstrated predictive power. A level with two touches is not
        statistically distinguishable from coincidence, and a different lookback
        gives different levels.
      </p>
    </div>
  );
}
