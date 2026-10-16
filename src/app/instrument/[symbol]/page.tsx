import type { Metadata } from "next";

import { PriceChart } from "@/components/PriceChart";
import {
  AttributionLine,
  Card,
  Disclosures,
  ErrorPanel,
  Metric,
  Notice,
  QualityIssues,
} from "@/components/ui";
import { api, attempt } from "@/lib/api";
import {
  daysBefore,
  formatDate,
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
  return { title: `${decodeURIComponent(symbol)} overview` };
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  const [candles, detail, present] = await Promise.all([
    attempt(
      api.candles(decoded, {
        start: `${daysBefore(400)}T00:00:00Z`,
        end: `${todayIso()}T23:59:59Z`,
      }),
    ),
    attempt(api.instrument(decoded)),
    attempt(api.presentAnalysis(decoded, { lookbackDays: 400 })),
  ]);

  return (
    <div className="stack">
      <Card
        title="Price history"
        subtitle="Last 400 calendar days, total-return basis"
      >
        {candles.ok ? (
          <>
            <PriceChart
              candles={candles.value.candles}
              currency={candles.value.currency}
              gaps={candles.value.gaps}
              ariaLabel={`${decoded} daily candlestick chart, ${candles.value.count} bars`}
            />
            <AttributionLine sources={candles.value.attribution} />
            {candles.value.disclosures.length > 0 && (
              <div className="mt-1">
                <Disclosures
                  items={candles.value.disclosures}
                  title="Notes on this chart data"
                />
              </div>
            )}
            <div className="mt-1">
              <QualityIssues issues={candles.value.quality_issues} />
            </div>
          </>
        ) : (
          <ErrorPanel
            title="No chart data"
            message={candles.error.message}
            details={candles.error.details}
          />
        )}
      </Card>

      {present.ok && (
        <Card
          title="Where the price sits"
          subtitle={`${present.value.observations} bars to ${formatDate(present.value.period_end)}`}
        >
          <OverviewMetrics analysis={present.value} />
          <div className="mt-2">
            <Disclosures items={present.value.disclosures} />
          </div>
        </Card>
      )}

      {!present.ok && present.error.isInsufficientData && (
        <Notice variant="warn" title="Not enough data for a current analysis">
          {present.error.message}
        </Notice>
      )}

      {detail.ok && (
        <>
          <Card title="What is held for this instrument">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Resolution</th>
                    <th>Source</th>
                    <th className="num">Observations</th>
                    <th>From</th>
                    <th>To</th>
                    <th className="num">Known gaps</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.value.coverage.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        Nothing is ingested for this instrument yet.
                      </td>
                    </tr>
                  ) : (
                    detail.value.coverage.map((entry, i) => (
                      <tr key={i}>
                        <td>{humanise(entry.data_kind)}</td>
                        <td className="mono">{entry.resolution ?? "—"}</td>
                        <td className="mono small">{entry.source}</td>
                        <td className="num mono">
                          {entry.observation_count.toLocaleString("en-US")}
                        </td>
                        <td className="mono small">
                          {formatDate(entry.first_observation)}
                        </td>
                        <td className="mono small">
                          {formatDate(entry.last_observation)}
                        </td>
                        <td className="num mono">{entry.known_gap_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="tiny subtle mt-1">
              Coverage differs between instruments. A resolution absent here
              cannot be analysed, and the platform will say so rather than
              approximating it from a coarser series.
            </p>
          </Card>

          <div className="grid grid-2">
            <Card title="Instrument">
              <dl className="small">
                <Row label="Internal id" value={<code>{detail.value.id}</code>} />
                <Row label="Exchange" value={`${detail.value.exchange_name ?? "—"} (${detail.value.exchange_code})`} />
                <Row label="MIC" value={detail.value.mic ?? "—"} />
                <Row label="Timezone" value={detail.value.timezone} />
                <Row label="Trading calendar" value={detail.value.calendar_code} />
                <Row label="Currency" value={detail.value.currency} />
                <Row label="Listed" value={formatDate(detail.value.listed_on)} />
                <Row label="ISIN" value={detail.value.isin ?? "—"} />
                <Row
                  label="Resolutions held"
                  value={detail.value.supported_resolutions.join(", ") || "none"}
                />
                <Row
                  label="Adjustment bases"
                  value={detail.value.supported_adjustment_bases.join(", ") || "none"}
                />
              </dl>
              <p className="tiny subtle mt-1">{detail.value.calendar_coverage_note}</p>
            </Card>

            <Card title="Issuer">
              {detail.value.issuer_name ? (
                <dl className="small">
                  <Row label="Name" value={detail.value.issuer_name} />
                  <Row label="Sector" value={detail.value.sector ?? "—"} />
                  <Row label="Industry" value={detail.value.industry ?? "—"} />
                  <Row label="SEC CIK" value={detail.value.cik ?? "—"} />
                  {detail.value.website && (
                    <Row
                      label="Website"
                      value={
                        <a href={detail.value.website} rel="noopener noreferrer nofollow" target="_blank">
                          {detail.value.website.replace(/^https?:\/\//, "")}
                        </a>
                      }
                    />
                  )}
                </dl>
              ) : (
                <p className="muted small">
                  No issuer is linked, so fundamental analysis is unavailable.
                  ETFs, indexes and currencies have no issuer by nature.
                </p>
              )}
              {detail.value.ticker_history.length > 1 && (
                <details className="expand mt-2">
                  <summary>Ticker history ({detail.value.ticker_history.length})</summary>
                  <table className="data">
                    <tbody>
                      {detail.value.ticker_history.map((entry, i) => (
                        <tr key={i}>
                          <td className="mono">{entry.symbol}</td>
                          <td className="small mono">
                            {entry.valid_from} → {entry.valid_to ?? "current"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="tiny subtle mt-1">
                    A historical analysis resolves the ticker that was in force
                    at the time, so a pre-rename period is found under its old
                    symbol.
                  </p>
                </details>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row-between" style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
      <dt className="subtle">{label}</dt>
      <dd className="mono" style={{ margin: 0, textAlign: "right" }}>
        {value}
      </dd>
    </div>
  );
}

function OverviewMetrics({
  analysis,
}: {
  analysis: Awaited<ReturnType<typeof api.presentAnalysis>>;
}) {
  const returns = analysis.methods["returns"];
  const vol = analysis.methods["realized_volatility"];
  const drawdown = analysis.methods["drawdown"];
  const rsi = analysis.methods["rsi"];
  const ma = analysis.methods["moving_averages"];
  const atr = analysis.methods["atr"];

  const totalReturn = returns?.ok ? (returns.values["total_return"] as number) : null;
  const annualVol = vol?.ok ? (vol.values["annualised_volatility"] as number) : null;
  const maxDd = drawdown?.ok ? (drawdown.values["max_drawdown"] as number) : null;
  const currentDd = drawdown?.ok ? (drawdown.values["current_drawdown"] as number) : null;
  const rsiValue = rsi?.ok ? (rsi.values["rsi"] as number) : null;
  const atrPct = atr?.ok ? (atr.values["atr_percent"] as number) : null;
  const vsSma200 = ma?.ok
    ? ((ma.values["price_vs_sma"] as Record<string, number | null> | undefined)?.["200"] ?? null)
    : null;

  return (
    <div className="grid grid-4">
      <Metric
        label="Window return"
        value={totalReturn === null ? null : formatPercent(totalReturn, 2, { withSign: true })}
        tone={totalReturn === null ? undefined : totalReturn >= 0 ? "up" : "down"}
        missingReason={returns?.unavailable_reason ?? undefined}
        note="first to last close"
      />
      <Metric
        label="Annualised volatility"
        value={annualVol === null ? null : formatPercent(annualVol, 1)}
        missingReason={vol?.unavailable_reason ?? undefined}
        note="realised, not a forecast"
      />
      <Metric
        label="Max drawdown"
        value={maxDd === null ? null : formatPercent(maxDd, 1)}
        tone={maxDd === null ? undefined : "down"}
        missingReason={drawdown?.unavailable_reason ?? undefined}
        note="close-to-close in window"
      />
      <Metric
        label="From running peak"
        value={currentDd === null ? null : formatPercent(currentDd, 1)}
        tone={currentDd === null ? undefined : currentDd < 0 ? "down" : "neutral"}
        missingReason={drawdown?.unavailable_reason ?? undefined}
      />
      <Metric
        label="RSI (14, Wilder)"
        value={rsiValue === null ? null : rsiValue.toFixed(1)}
        missingReason={rsi?.unavailable_reason ?? undefined}
        note="momentum balance, not a signal"
      />
      <Metric
        label="ATR as % of price"
        value={atrPct === null ? null : formatPercent(atrPct, 2)}
        missingReason={atr?.unavailable_reason ?? undefined}
        note="typical daily range"
      />
      <Metric
        label="Price vs 200-day avg"
        value={vsSma200 === null ? null : formatPercent(vsSma200, 1, { withSign: true })}
        tone={vsSma200 === null ? undefined : vsSma200 >= 0 ? "up" : "down"}
        missingReason={
          ma?.ok ? "the 200-period window exceeds the available history" : ma?.unavailable_reason ?? undefined
        }
      />
      <Metric
        label="Last close"
        value={
          returns?.ok
            ? formatPrice(returns.values["last_close"] as number, analysis.currency)
            : null
        }
        missingReason={returns?.unavailable_reason ?? undefined}
      />
    </div>
  );
}
