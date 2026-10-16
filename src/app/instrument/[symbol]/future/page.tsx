import type { Metadata } from "next";

import { ForecastControls } from "@/components/ForecastControls";
import { PriceChart } from "@/components/PriceChart";
import {
  Badge,
  Card,
  Disclosures,
  ErrorPanel,
  Metric,
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
import type { ValidationMetrics } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol)} forecast` };
}

export default async function FuturePage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ model?: string; horizon?: string }>;
}) {
  const { symbol } = await params;
  const { model, horizon } = await searchParams;
  const decoded = decodeURIComponent(symbol);
  const modelKey = model ?? "random_walk";
  const horizonLabel = horizon ?? "1mo";
  const base = `/instrument/${encodeURIComponent(decoded)}/future`;

  const [models, forecast, candles, comparison] = await Promise.all([
    attempt(api.forecastModels()),
    attempt(
      api.forecast(decoded, {
        model_key: modelKey,
        horizon: horizonLabel,
        include_validation: true,
      }),
    ),
    attempt(
      api.candles(decoded, {
        start: `${daysBefore(400)}T00:00:00Z`,
        end: `${todayIso()}T23:59:59Z`,
      }),
    ),
    attempt(api.compareModels(decoded, horizonLabel)),
  ]);

  return (
    <div className="stack">
      <Notice variant="brand" title="What a forecast here is">
        A probability distribution produced by a stated model under stated
        assumptions — not a prediction of what will happen. The interval matters
        more than the central estimate. Every forecast below is shown with that
        model&apos;s out-of-sample track record against a random-walk baseline.
      </Notice>

      {models.ok && (
        <Card title="Choose a model and horizon">
          <ForecastControls
            basePath={base}
            models={models.value}
            selectedModel={modelKey}
            selectedHorizon={horizonLabel}
          />
        </Card>
      )}

      {!forecast.ok ? (
        <ErrorPanel
          title={
            forecast.error.isInsufficientData
              ? "This model cannot run on the available history"
              : "Could not produce a forecast"
          }
          message={forecast.error.message}
          details={forecast.error.details}
          hint="Each model declares the observations and horizons it supports; try another model or a shorter horizon."
        />
      ) : (
        <>
          <Card
            title={`${humanise(forecast.value.model_key)} · ${forecast.value.horizon_label}`}
            subtitle={`information cutoff ${formatDate(forecast.value.information_cutoff)} · resolves ${formatDate(forecast.value.resolves_at)}`}
            action={
              <div className="row">
                {forecast.value.is_baseline && <Badge variant="info">baseline</Badge>}
                <Badge
                  variant={
                    forecast.value.lifecycle === "validated" ? "default" : "warn"
                  }
                  title={`Lifecycle: ${forecast.value.lifecycle}`}
                >
                  {forecast.value.lifecycle}
                </Badge>
              </div>
            }
          >
            <div className="grid grid-4">
              <Metric
                label="Central estimate"
                value={formatPercent(forecast.value.point_estimate, 2, { withSign: true })}
                note={
                  forecast.value.point_estimate === 0
                    ? "zero by construction: this model makes no directional call"
                    : "log return over the horizon"
                }
              />
              <Metric
                label="Probability of a gain"
                value={formatPercent(forecast.value.prob_positive, 1)}
                note={
                  forecast.value.prob_positive === 0.5
                    ? "exactly 0.5 by construction, not an estimated edge"
                    : undefined
                }
              />
              <Metric
                label="Expected volatility"
                value={formatPercent(forecast.value.predicted_volatility, 1)}
                note="over the whole horizon"
              />
              <Metric
                label="Distribution"
                value={humanise(forecast.value.distribution_family)}
                note={`${forecast.value.observations_used} observations used`}
              />
            </div>

            {Object.keys(forecast.value.price_levels).length > 0 && (
              <div className="mt-2">
                <h4>Price levels implied by the distribution</h4>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Quantile</th>
                        <th className="num">Price</th>
                        <th className="num">Change from {formatPrice(forecast.value.base_price)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(forecast.value.price_levels)
                        .sort((a, b) => Number(a[0]) - Number(b[0]))
                        .map(([quantile, price]) => {
                          const change =
                            forecast.value.base_price !== null
                              ? price / forecast.value.base_price - 1
                              : null;
                          return (
                            <tr key={quantile}>
                              <td className="mono">
                                {(Number(quantile) * 100).toFixed(0)}%
                                {Math.abs(Number(quantile) - 0.5) < 1e-9 && (
                                  <span className="subtle"> (median)</span>
                                )}
                              </td>
                              <td className="num mono">{formatPrice(price)}</td>
                              <td className={`num mono ${change !== null && change >= 0 ? "up" : "down"}`}>
                                {formatPercent(change, 2, { withSign: true })}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="tiny subtle mt-1">
                  These are quantiles of a modelled distribution, not targets. A
                  5% quantile means the model assigns a 5% chance to an outcome
                  at or below it, conditional on its assumptions holding.
                </p>
              </div>
            )}
          </Card>

          {candles.ok && candles.value.candles.length > 0 && (
            <Card
              title="Forecast fan against recent price"
              subtitle="Shaded bands are the model's quantile intervals, projected over the horizon"
            >
              <PriceChart
                candles={candles.value.candles}
                currency={candles.value.currency}
                gaps={candles.value.gaps}
                forecast={{
                  label: forecast.value.model_key,
                  horizonBars: forecast.value.horizon_bars,
                  levels: forecast.value.price_levels,
                }}
                ariaLabel={`${decoded} price chart with a ${forecast.value.horizon_label} forecast distribution`}
              />
            </Card>
          )}

          <Card
            title="Has this model worked?"
            subtitle="Walk-forward, out of sample, scored only after each horizon closed"
          >
            {forecast.value.validation?.available && forecast.value.validation.metrics ? (
              <ValidationPanel metrics={forecast.value.validation.metrics} validation={forecast.value.validation} />
            ) : (
              <Notice variant="warn" title="No validation available">
                {forecast.value.validation?.reason ??
                  "This model has not been evaluated on this instrument."}
              </Notice>
            )}
          </Card>

          <div className="grid grid-2">
            <Card title="What the model assumes">
              <ul className="disclosure-list">
                {forecast.value.assumptions.map((assumption, i) => (
                  <li key={i}>{assumption}</li>
                ))}
              </ul>
            </Card>
            <Card title="What would invalidate this forecast">
              <ul className="disclosure-list">
                {forecast.value.invalidation_conditions.map((condition, i) => (
                  <li key={i}>{condition}</li>
                ))}
              </ul>
            </Card>
          </div>

          {forecast.value.contributing_factors.length > 0 && (
            <Card title="What drove the numbers">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Factor</th>
                      <th className="num">Value</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.value.contributing_factors.map((factor, i) => (
                      <tr key={i}>
                        <td>{humanise(factor.factor)}</td>
                        <td className="num mono">{formatNumber(factor.value, 5)}</td>
                        <td className="small">{factor.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {forecast.value.warnings.length > 0 && (
            <Card title="Warnings on this forecast">
              {forecast.value.warnings.map((warning, i) => (
                <Notice key={i} variant="warn">
                  {warning}
                </Notice>
              ))}
            </Card>
          )}

          <Card title="Limitations of this model">
            <Disclosures items={forecast.value.limitations} title="Model limitations" open />
          </Card>
        </>
      )}

      {comparison.ok && (
        <Card
          title="Every model, side by side"
          subtitle={`Walk-forward at the ${comparison.value.horizon} horizon on ${decoded}`}
        >
          <ComparisonTable comparison={comparison.value} />
          <p className="small muted mt-2">{comparison.value.note}</p>
        </Card>
      )}
    </div>
  );
}

function ValidationPanel({
  metrics,
  validation,
}: {
  metrics: ValidationMetrics;
  validation: NonNullable<Awaited<ReturnType<typeof api.forecast>>["validation"]>;
}) {
  const verdictTone =
    metrics.calibration_verdict === "well_calibrated"
      ? "up"
      : metrics.calibration_verdict === "not_assessed"
        ? undefined
        : "down";

  // The API warns that directional accuracy is absent, which an API consumer
  // needs: an explained absence is the point. This page already renders that
  // explanation as its own notice, so repeating it verbatim underneath reads
  // as two separate problems rather than one deliberate omission.
  const unduplicatedWarnings = metrics.warnings.filter(
    (warning) =>
      !(
        metrics.directional_accuracy === null &&
        warning.startsWith("no directional accuracy is reported")
      ),
  );

  return (
    <div>
      <div className="grid grid-4">
        <Metric
          label="Out-of-sample forecasts"
          value={metrics.n_forecasts.toString()}
          note="each made before its outcome was known"
        />
        <Metric
          label="Mean CRPS"
          value={formatNumber(metrics.mean_crps, 5)}
          note="lower is better; scores the whole distribution"
        />
        <Metric
          label={`Skill vs ${metrics.baseline_key ?? "baseline"}`}
          value={
            metrics.skill_vs_baseline === null
              ? "this is the baseline"
              : formatNumber(metrics.skill_vs_baseline, 4)
          }
          tone={
            metrics.skill_vs_baseline === null
              ? undefined
              : metrics.skill_vs_baseline > 0
                ? "up"
                : "down"
          }
          note="above zero means it beats the random walk"
        />
        <Metric
          label="Calibration"
          value={humanise(metrics.calibration_verdict)}
          tone={verdictTone}
          note={
            metrics.pit_uniformity_p !== null
              ? `PIT uniformity p = ${formatNumber(metrics.pit_uniformity_p, 4)}`
              : undefined
          }
        />
      </div>

      {Object.keys(metrics.interval_coverage).length > 0 && (
        <div className="mt-2">
          <h4>Did the intervals hold?</h4>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nominal interval</th>
                  <th className="num">Realised coverage</th>
                  <th className="num">Gap</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.interval_coverage).map(([label, realised]) => {
                  const nominal = Number.parseInt(label.replace("%", ""), 10) / 100;
                  const gap = realised - nominal;
                  return (
                    <tr key={label}>
                      <td className="mono">{label}</td>
                      <td className="num mono">{formatPercent(realised, 1)}</td>
                      <td className={`num mono ${Math.abs(gap) > 0.1 ? "down" : ""}`}>
                        {formatPercent(gap, 1, { withSign: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tiny subtle mt-1">
            A nominal 90% interval that held only 60% of the time means the
            model is overconfident. A large positive gap means it is wider than
            it needs to be.
          </p>
        </div>
      )}

      {metrics.directional_accuracy === null ? (
        <Notice variant="info" title="No directional accuracy is reported">
          This model makes no directional call, so scoring the sign of the
          outcome would measure nothing. CRPS and interval coverage are the
          meaningful measures here.
        </Notice>
      ) : (
        <Metric
          label="Directional accuracy"
          value={formatPercent(metrics.directional_accuracy, 1)}
          note="secondary to CRPS for a probabilistic model"
        />
      )}

      {unduplicatedWarnings.length > 0 && (
        <div className="mt-2">
          {unduplicatedWarnings.map((warning, i) => (
            <Notice key={i} variant="warn">
              {warning}
            </Notice>
          ))}
        </div>
      )}

      {validation.limitations && validation.limitations.length > 0 && (
        <div className="mt-2">
          <Disclosures
            items={validation.limitations}
            title="Limitations of this evaluation"
          />
        </div>
      )}

      {validation.execution_assumptions &&
        typeof validation.execution_assumptions["zero_cost_warning"] === "string" && (
          <Notice variant="warn" title="Execution costs">
            {validation.execution_assumptions["zero_cost_warning"] as string}
          </Notice>
        )}
    </div>
  );
}

function ComparisonTable({
  comparison,
}: {
  comparison: Awaited<ReturnType<typeof api.compareModels>>;
}) {
  const rows = comparison.results
    .filter((r) => r.available && r.metrics)
    .sort((a, b) => {
      const sa = a.metrics?.skill_vs_baseline ?? -Infinity;
      const sb = b.metrics?.skill_vs_baseline ?? -Infinity;
      return sb - sa;
    });
  const unavailable = comparison.results.filter((r) => !r.available);

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Model</th>
              <th className="num">Forecasts</th>
              <th className="num">CRPS</th>
              <th className="num">Skill vs baseline</th>
              <th>Calibration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const skill = row.metrics?.skill_vs_baseline ?? null;
              return (
                <tr key={row.model_key}>
                  <td>
                    <span className="mono">{row.model_key}</span>
                    {row.is_baseline && (
                      <>
                        {" "}
                        <Badge variant="info">baseline</Badge>
                      </>
                    )}
                  </td>
                  <td className="num mono">{row.metrics?.n_forecasts ?? "—"}</td>
                  <td className="num mono">{formatNumber(row.metrics?.mean_crps, 5)}</td>
                  <td className={`num mono ${skill === null ? "" : skill > 0 ? "up" : "down"}`}>
                    {skill === null ? "reference" : formatNumber(skill, 4)}
                  </td>
                  <td className="small">
                    {humanise(row.metrics?.calibration_verdict ?? "not assessed")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {unavailable.length > 0 && (
        <details className="expand mt-2">
          <summary>Models that could not be evaluated ({unavailable.length})</summary>
          <ul className="disclosure-list">
            {unavailable.map((row) => (
              <li key={row.model_key}>
                <span className="mono">{row.model_key}</span>: {row.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
