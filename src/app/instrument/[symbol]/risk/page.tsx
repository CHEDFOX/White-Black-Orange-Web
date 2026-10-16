import type { Metadata } from "next";

import { MethodTable } from "@/components/MethodTable";
import {
  Card,
  Disclosures,
  ErrorPanel,
  Metric,
  MethodBlock,
  Notice,
} from "@/components/ui";
import { api, attempt } from "@/lib/api";
import { formatNumber, formatPercent, formatPrice, formatVolume } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol)} risk` };
}

export default async function RiskPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ vol?: string }>;
}) {
  const { symbol } = await params;
  const { vol } = await searchParams;
  const decoded = decodeURIComponent(symbol);
  const targetVol = Number.parseFloat(vol ?? "0.15") || 0.15;

  const [risk, structure] = await Promise.all([
    attempt(api.risk(decoded, { targetVol })),
    attempt(
      api.tradeStructure(decoded, {
        direction: "long",
        stop_atr_multiple: 2,
        target_atr_multiples: [2, 4, 6],
        account_value: 100_000,
        account_risk_fraction: 0.01,
      }),
    ),
  ]);

  if (!risk.ok) {
    return (
      <ErrorPanel
        title={
          risk.error.isInsufficientData
            ? "Not enough history for a risk profile"
            : "Could not compute a risk profile"
        }
        message={risk.error.message}
        details={risk.error.details}
      />
    );
  }

  const profile = risk.value.methods["risk_profile"];
  const sizing = risk.value.methods["position_sizing"];
  const scenarios = risk.value.methods["scenario_analysis"];
  const disclaimer = profile?.ok
    ? (profile.values["disclaimer"] as string | undefined)
    : undefined;

  return (
    <div className="stack">
      <Notice variant="brand" title="Educational research output">
        {disclaimer ??
          "This is quantitative research output for education and analysis. It is " +
            "not investment advice, not a recommendation to buy or sell, and takes " +
            "no account of any individual's circumstances, objectives or risk tolerance."}
      </Notice>

      <Card
        title="How much this instrument moves"
        subtitle={`${risk.value.observations} bars to ${risk.value.period_end?.slice(0, 10)}`}
      >
        <MethodBlock outcome={profile}>
          <div className="grid grid-4">
            <Metric
              label="Annualised volatility"
              value={formatPercent(profile?.values["annualised_volatility"] as number, 1)}
              note="realised, not a forecast"
            />
            <Metric
              label="ATR as % of price"
              value={formatPercent(profile?.values["atr_percent"] as number, 2)}
              note="typical daily range"
            />
            <Metric
              label="Worst day in window"
              value={formatPercent(profile?.values["worst_observed_return"] as number, 2)}
              tone="down"
            />
            <Metric
              label="Max drawdown"
              value={formatPercent(profile?.values["max_drawdown"] as number, 1)}
              tone="down"
              note="close-to-close; intraday was worse"
            />
          </div>

          <div className="mt-2">
            <h4>Tail loss estimates</h4>
            <MethodTable
              outcome={profile}
              fields={[
                { key: "var_95", label: "95% value-at-risk", format: (v) => formatPercent(v as number, 2), note: "one day; the threshold, not the size of the loss beyond it" },
                { key: "var_99", label: "99% value-at-risk", format: (v) => formatPercent(v as number, 2) },
                { key: "expected_shortfall_95", label: "Expected shortfall beyond 95%", format: (v) => formatPercent(v as number, 2), note: "the average loss once the threshold is breached" },
              ]}
            />
            <p className="tiny subtle mt-1">
              These are historical estimates bounded by the worst move in this
              sample. They cannot describe a loss larger than any observed, and
              the next period can be worse than anything here.
            </p>
          </div>
        </MethodBlock>
      </Card>

      <div className="grid grid-2">
        <Card
          title="Overnight gap risk"
          subtitle="What an intraday stop cannot protect against"
        >
          {profile?.ok && <GapRisk profile={profile.values["gap_risk"] as Record<string, number>} />}
        </Card>

        <Card title="Liquidity">
          {profile?.ok && (
            <LiquidityPanel
              liquidity={profile.values["liquidity"] as Record<string, number>}
              currency={risk.value.currency}
              warnings={profile.warnings}
            />
          )}
        </Card>
      </div>

      <Card
        title="Position sizing"
        subtitle={`Targeting ${formatPercent(targetVol, 0)} annual portfolio volatility`}
      >
        <MethodBlock outcome={sizing}>
          <MethodTable
            outcome={sizing}
            fields={[
              { key: "volatility_target_weight", label: "Weight for the volatility target", format: (v) => formatPercent(v as number, 1) },
              { key: "annualised_volatility", label: "Instrument volatility", format: (v) => formatPercent(v as number, 1) },
              { key: "weight_capped", label: "Capped at the maximum", format: (v) => (v ? "yes" : "no") },
            ]}
          />
          <Notice variant="info" title="On correlation">
            Sizing a single position ignores its correlation with everything
            else held. Several individually small positions in correlated
            instruments are not diversified.
          </Notice>
        </MethodBlock>
      </Card>

      {structure.ok && (
        <Card
          title="A worked example: long entry with a 2× ATR stop"
          subtitle="Arithmetic only. Not a recommendation, and not a suggestion to take this trade."
        >
          <MethodBlock outcome={structure.value.methods["trade_structure"]}>
            <TradeStructure analysis={structure.value} />
          </MethodBlock>
        </Card>
      )}

      <Card
        title="Scenarios"
        subtitle="What specified moves would mean in price terms"
      >
        <MethodBlock outcome={scenarios}>
          {scenarios?.ok && (
            <ScenarioTable
              scenarios={
                scenarios.values["scenarios"] as Array<{
                  label: string;
                  shock: number;
                  resulting_price: number;
                  historical_frequency: number | null;
                  frequency_basis: string | null;
                }>
              }
              currency={risk.value.currency}
            />
          )}
        </MethodBlock>
      </Card>

      <Card title="What this risk analysis does and does not show">
        <Disclosures items={risk.value.disclosures} open />
      </Card>
    </div>
  );
}

function GapRisk({ profile }: { profile: Record<string, number> }) {
  if (!profile || Object.keys(profile).length === 0) {
    return (
      <p className="small muted">
        Gap risk could not be measured, because no opening prices are available
        for this window.
      </p>
    );
  }
  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <tbody>
            <tr>
              <th style={{ textTransform: "none" }}>Largest gap down</th>
              <td className="num mono down">
                {formatPercent(profile["largest_gap_down"], 2)}
              </td>
            </tr>
            <tr>
              <th style={{ textTransform: "none" }}>Largest gap up</th>
              <td className="num mono up">
                {formatPercent(profile["largest_gap_up"], 2, { withSign: true })}
              </td>
            </tr>
            <tr>
              <th style={{ textTransform: "none" }}>95th percentile absolute gap</th>
              <td className="num mono">
                {formatPercent(profile["p95_absolute_gap"], 2)}
              </td>
            </tr>
            <tr>
              <th style={{ textTransform: "none" }}>Sessions gapping over 1%</th>
              <td className="num mono">
                {formatPercent(profile["gaps_beyond_1_percent"], 1)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="tiny subtle mt-1">
        A stop is not a guaranteed exit. When an overnight gap exceeds the stop
        distance, the fill is worse than the stated price and the realised loss
        exceeds the planned one.
      </p>
    </div>
  );
}

function LiquidityPanel({
  liquidity,
  currency,
  warnings,
}: {
  liquidity: Record<string, number>;
  currency: string;
  warnings: string[];
}) {
  if (!liquidity || Object.keys(liquidity).length === 0) {
    return (
      <div>
        <p className="small muted">
          No volume data is available for this window, so liquidity and
          execution risk are not assessed.
        </p>
        {warnings
          .filter((w) => w.includes("volume"))
          .map((w, i) => (
            <Notice key={i} variant="warn">
              {w}
            </Notice>
          ))}
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <tbody>
          <tr>
            <th style={{ textTransform: "none" }}>Median daily volume</th>
            <td className="num mono">{formatVolume(liquidity["median_volume"])}</td>
          </tr>
          <tr>
            <th style={{ textTransform: "none" }}>Median daily turnover</th>
            <td className="num mono">
              {formatVolume(liquidity["median_dollar_volume"])} {currency}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="tiny subtle mt-1">
        Reported volume depends on venue consolidation rules and differs between
        providers, so cross-provider comparison is unreliable.
      </p>
    </div>
  );
}

function TradeStructure({
  analysis,
}: {
  analysis: Awaited<ReturnType<typeof api.tradeStructure>>;
}) {
  const outcome = analysis.methods["trade_structure"];
  if (!outcome?.ok) return null;
  const structure = outcome.values["structure"] as {
    direction: string;
    entry: number;
    stop: number;
    targets: number[];
    stop_distance_percent: number;
    stop_distance_atr: number;
    risk_reward_ratios: number[];
    position_size: number | null;
    account_risk_fraction: number;
    notes: string[];
  } | null;
  if (!structure) {
    return <p className="small muted">An ATR could not be computed, so no structure is proposed.</p>;
  }
  const jumpProbability = outcome.values["stop_jump_probability"] as number | null;

  return (
    <div>
      <div className="grid grid-4">
        <Metric label="Entry (last close)" value={formatPrice(structure.entry, analysis.currency)} />
        <Metric
          label="Stop"
          value={formatPrice(structure.stop, analysis.currency)}
          note={`${structure.stop_distance_atr}× ATR = ${formatPercent(structure.stop_distance_percent, 2)}`}
          tone="down"
        />
        <Metric
          label="Position size"
          value={
            structure.position_size === null
              ? null
              : `${formatNumber(structure.position_size, 0)} units`
          }
          note={`at ${formatPercent(structure.account_risk_fraction, 0)} of a 100,000 account`}
          missingReason="no account value was supplied"
        />
        <Metric
          label="Overnight gap jumped this stop"
          value={formatPercent(jumpProbability, 1)}
          tone={jumpProbability !== null && jumpProbability > 0.01 ? "down" : undefined}
          note="historical frequency in this window"
          missingReason="no opening prices available"
        />
      </div>

      <div className="mt-2 table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Target</th>
              <th className="num">Price</th>
              <th className="num">Reward : risk</th>
            </tr>
          </thead>
          <tbody>
            {structure.targets.map((target, i) => (
              <tr key={i}>
                <td>Target {i + 1}</td>
                <td className="num mono">{formatPrice(target, analysis.currency)}</td>
                <td className="num mono">
                  {formatNumber(structure.risk_reward_ratios[i], 2)} : 1
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Notice variant="warn" title="What a reward:risk ratio does not say">
        It carries no probability of reaching either level. A 3:1 ratio with a
        20% hit rate loses money. The levels above are volatility-scaled
        arithmetic, not a view on where the price will go.
      </Notice>
    </div>
  );
}

function ScenarioTable({
  scenarios,
  currency,
}: {
  scenarios: Array<{
    label: string;
    shock: number;
    resulting_price: number;
    historical_frequency: number | null;
    frequency_basis: string | null;
  }>;
  currency: string;
}) {
  if (!scenarios?.length) return null;
  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Move</th>
              <th className="num">Resulting price</th>
              <th className="num">Historical frequency</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr key={scenario.label}>
                <td className={`mono ${scenario.shock >= 0 ? "up" : "down"}`}>
                  {scenario.label}
                </td>
                <td className="num mono">
                  {formatPrice(scenario.resulting_price, currency)}
                </td>
                <td className="num mono">
                  {formatPercent(scenario.historical_frequency, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny subtle mt-1">
        {scenarios[0]?.frequency_basis ??
          "Frequencies are measured over this window only."}{" "}
        A scenario is a conditional statement, not a forecast, and the frequency
        is a historical rate rather than a probability for the next move.
      </p>
    </div>
  );
}
