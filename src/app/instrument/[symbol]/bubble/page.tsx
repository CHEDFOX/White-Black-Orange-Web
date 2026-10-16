import type { Metadata } from "next";

import { MethodTable } from "@/components/MethodTable";
import {
  Badge,
  Card,
  Disclosures,
  ErrorPanel,
  Metric,
  MethodBlock,
  Notice,
} from "@/components/ui";
import { api, attempt } from "@/lib/api";
import { formatNumber, formatPercent, humanise } from "@/lib/format";
import type { BubbleSignal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol)} speculative risk` };
}

export default async function BubblePage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);
  const analysis = await attempt(api.bubble(decoded));

  if (!analysis.ok) {
    return (
      <ErrorPanel
        title={
          analysis.error.isInsufficientData
            ? "Not enough history for a speculative-risk assessment"
            : "Could not run the assessment"
        }
        message={analysis.error.message}
        details={analysis.error.details}
        hint="The assessment needs at least 250 daily bars so each signal has a baseline to compare against."
      />
    );
  }

  const assessment = analysis.value.methods["bubble_assessment"];
  if (!assessment?.ok) {
    return (
      <Notice variant="warn" title="Assessment not computed">
        {assessment?.unavailable_reason ?? "No reason was given, which is itself a defect."}
      </Notice>
    );
  }

  const values = assessment.values;
  const signals = (values["signals"] ?? []) as BubbleSignal[];
  const score = values["vulnerability_score"] as number | null;
  const band = values["vulnerability_band"] as string | null;
  const triggered = signals.filter((s) => s.status === "triggered");
  const notTriggered = signals.filter((s) => s.status === "not_triggered");
  const unavailable = signals.filter((s) => s.status === "unavailable");

  return (
    <div className="stack">
      <Notice variant="brand" title="What this assessment is and is not">
        It detects conditions <em>associated with</em> past speculative
        episodes. It cannot distinguish a bubble from a justified re-rating, and
        most instruments that trigger several signals do not crash. No crash
        date and no crash probability is produced anywhere on this page —
        overvaluation can persist for years, and an episode can end in
        stagnation or in fundamentals catching up rather than in a decline.
      </Notice>

      <Card
        title="Vulnerability estimate"
        subtitle={`${values["signals_triggered"]} of ${values["signals_evaluated"]} evaluable signals triggered, out of ${values["signals_total"]} total`}
        action={
          band && (
            <Badge
              variant={
                band === "high" ? "down" : band === "elevated" ? "warn" : "default"
              }
            >
              {band}
            </Badge>
          )
        }
      >
        <div className="grid grid-4">
          <Metric
            label="Vulnerability score"
            value={score === null ? null : `${formatNumber(score, 0)} / 100`}
            tone={score !== null && score >= 50 ? "down" : undefined}
            missingReason="no signal could be evaluated"
            note="a weighted aggregation, not a probability"
          />
          <Metric label="Band" value={band ? humanise(band) : null} />
          <Metric
            label="Signals triggered"
            value={`${values["signals_triggered"]} / ${values["signals_evaluated"]}`}
            note="of those that could be evaluated"
          />
          <Metric
            label="Signals unavailable"
            value={`${unavailable.length} / ${values["signals_total"]}`}
            tone={unavailable.length >= 5 ? "down" : undefined}
            note="excluded from the score's denominator"
          />
        </div>

        <Notice variant="info" title="How the score is computed">
          {String(values["scoring_formula"])}. Unavailable signals are left out
          of the denominator rather than counted as benign, so a low score from
          three evaluable signals is not the same as a low score from ten — and
          the counts above make the difference visible.
        </Notice>

        {assessment.warnings.map((warning, i) => (
          <Notice key={i} variant="warn">
            {warning}
          </Notice>
        ))}
      </Card>

      <Card title="Signals that fired" subtitle={`${triggered.length} of ${signals.length}`}>
        {triggered.length === 0 ? (
          <p className="muted">
            No warning signal is currently triggered among those that could be
            evaluated.
          </p>
        ) : (
          <SignalList signals={triggered} />
        )}
      </Card>

      <Card
        title="Signals that did not fire"
        subtitle="Evidence against an elevated reading"
      >
        {notTriggered.length === 0 ? (
          <p className="muted">
            No evaluable signal came back negative, which is itself notable.
          </p>
        ) : (
          <SignalList signals={notTriggered} showCounter />
        )}
      </Card>

      <Card
        title="Signals that could not be evaluated"
        subtitle="Missing data is not evidence of low risk"
      >
        {unavailable.length === 0 ? (
          <p className="muted">Every signal could be evaluated.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Why it could not be evaluated</th>
                  </tr>
                </thead>
                <tbody>
                  {unavailable.map((signal) => (
                    <tr key={signal.key}>
                      <td>{signal.display_name}</td>
                      <td className="small">{signal.unavailable_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Notice variant="warn" title="Why this matters">
              The strongest speculation signals — options positioning, leverage,
              margin debt, retail flows — need licensed feeds this build does
              not have. A low score may therefore reflect missing data rather
              than low risk.
            </Notice>
          </>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title="What would strengthen this reading">
          <ul className="disclosure-list">
            {((values["strengthening_conditions"] ?? []) as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Card>
        <Card title="What would weaken it">
          <ul className="disclosure-list">
            {((values["weakening_conditions"] ?? []) as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Valuation context">
        <MethodBlock outcome={analysis.value.methods["valuation_ratios"]}>
          <MethodTable
            outcome={analysis.value.methods["valuation_ratios"]}
            fields={[
              { key: "price_to_earnings", label: "Price / earnings", format: (v) => `${formatNumber(v as number, 1)}×` },
              { key: "price_to_sales", label: "Price / sales", format: (v) => `${formatNumber(v as number, 1)}×` },
              { key: "ev_to_ebit", label: "EV / operating income", format: (v) => `${formatNumber(v as number, 1)}×` },
              { key: "free_cash_flow_yield", label: "Free cash flow yield", format: (v) => formatPercent(v as number, 2) },
            ]}
          />
        </MethodBlock>
        <div className="mt-2">
          <MethodBlock outcome={analysis.value.methods["growth_trajectory"]}>
            <MethodTable
              outcome={analysis.value.methods["growth_trajectory"]}
              fields={[
                { key: "revenue_growth_latest", label: "Latest revenue growth", format: (v) => formatPercent(v as number, 1, { withSign: true }) },
                { key: "revenue_cagr", label: "Revenue CAGR", format: (v) => formatPercent(v as number, 1, { withSign: true }) },
                { key: "net_income_cagr", label: "Net income CAGR", format: (v) => formatPercent(v as number, 1, { withSign: true }) },
              ]}
            />
          </MethodBlock>
        </div>
      </Card>

      <Card title="Limitations of this assessment">
        <Disclosures items={assessment.limitations} title="Method limitations" open />
        <div className="mt-2">
          <Disclosures items={analysis.value.disclosures} title="Data notes" />
        </div>
      </Card>
    </div>
  );
}

function SignalList({
  signals,
  showCounter = false,
}: {
  signals: BubbleSignal[];
  showCounter?: boolean;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {signals.map((signal) => (
        <details className="expand" key={signal.key}>
          <summary>
            <span className="row" style={{ display: "inline-flex" }}>
              <Badge
                variant={signal.status === "triggered" ? "down" : "default"}
              >
                {signal.status === "triggered" ? "triggered" : "not triggered"}
              </Badge>
              {signal.display_name}
              {signal.weight !== 1 && (
                <span className="tiny subtle">weight {signal.weight}</span>
              )}
            </span>
          </summary>
          <p className="small">{signal.description}</p>
          {signal.evidence && (
            <p className="small">
              <strong>Observed: </strong>
              {signal.evidence}
            </p>
          )}
          {showCounter && signal.counter_evidence && (
            <p className="small">
              <strong>Against: </strong>
              {signal.counter_evidence}
            </p>
          )}
          {signal.threshold !== null && (
            <p className="tiny subtle">
              Threshold {formatNumber(signal.threshold, 2)}
              {signal.observed_value !== null && (
                <> · observed {formatNumber(signal.observed_value, 4)}</>
              )}
              . Thresholds are conventions chosen for interpretability, not
              values estimated from a sample of historical bubbles.
            </p>
          )}
          {signal.limitations.length > 0 && (
            <ul className="disclosure-list">
              {signal.limitations.map((limitation, i) => (
                <li key={i}>{limitation}</li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </div>
  );
}
