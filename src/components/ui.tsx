/**
 * Shared presentation components.
 *
 * Several of these exist specifically to make a caveat hard to omit:
 * `Metric` renders a missing value as an explained absence rather than a
 * dash, `Disclosures` is a required-prop component, and `MethodBlock` will not
 * render a figure without the method version that produced it.
 */

import type { ReactNode } from "react";

import { MISSING, humanise, isMissing } from "@/lib/format";
import type {
  Attribution,
  ClaimKind,
  DataFreshness,
  MethodOutcome,
  QualityIssue,
} from "@/lib/types";

export function Card({
  title,
  subtitle,
  action,
  children,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="card" id={id}>
      {(title || action) && (
        <header className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * A single figure.
 *
 * When `value` is missing, `missingReason` is shown instead. That argument is
 * required so a component cannot render an unexplained blank: "not computed"
 * and "zero" must never look the same.
 */
export function Metric({
  label,
  value,
  note,
  tone,
  missingReason,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "up" | "down" | "neutral";
  missingReason?: string;
}) {
  const missing = isMissing(value) || value === MISSING || value === "";
  return (
    <div className={`metric${missing ? " metric-missing" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className={`metric-value${tone && !missing ? ` ${tone}` : ""}`}>
        {missing ? "not available" : value}
      </div>
      {missing && missingReason && <div className="metric-note">{missingReason}</div>}
      {!missing && note && <div className="metric-note">{note}</div>}
    </div>
  );
}

export function Badge({
  children,
  variant = "default",
  title,
}: {
  children: ReactNode;
  variant?: "default" | "brand" | "up" | "down" | "warn" | "info";
  title?: string;
}) {
  const cls = variant === "default" ? "badge" : `badge badge-${variant}`;
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

const CLAIM_SHORT: Record<ClaimKind, string> = {
  observed_fact: "Observed",
  deterministic_calculation: "Calculated",
  statistical_relationship: "Statistical",
  model_estimate: "Model estimate",
  causal_hypothesis: "Hypothesis",
  interpretation: "Interpretation",
  scenario: "Scenario",
  unknown: "Unknown",
};

/** The epistemic label attached to every finding. */
export function ClaimLabel({ kind, title }: { kind: ClaimKind; title?: string }) {
  return (
    <span className={`claim claim-${kind}`} title={title ?? humanise(kind)}>
      {CLAIM_SHORT[kind] ?? humanise(kind)}
    </span>
  );
}

export function Notice({
  variant = "info",
  title,
  children,
}: {
  variant?: "info" | "warn" | "error" | "brand";
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${variant}`}>
      {title && <div className="notice-title">{title}</div>}
      <div>{children}</div>
    </div>
  );
}

/**
 * The disclosures the backend attached to a result.
 *
 * `items` is required rather than optional: a page that renders analysis must
 * pass the backend's disclosures, even if the list is empty.
 */
export function Disclosures({
  items,
  title = "What this analysis does and does not show",
  open = false,
}: {
  items: string[];
  title?: string;
  open?: boolean;
}) {
  if (!items.length) return null;
  return (
    <details className="expand" open={open}>
      <summary>
        {title} ({items.length})
      </summary>
      <ul className="disclosure-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

export function FreshnessBadge({ freshness }: { freshness: DataFreshness }) {
  return (
    <Badge variant={freshness.is_stale ? "warn" : "default"} title={freshness.note}>
      {freshness.is_stale ? "data may be stale" : "data current"}
      {freshness.age_days !== null && ` · ${freshness.age_days}d`}
    </Badge>
  );
}

export function AttributionLine({ sources }: { sources: Attribution[] }) {
  const required = sources.filter((s) => s.attribution_required && s.attribution_text);
  if (!required.length) return null;
  return (
    <p className="tiny subtle mt-1">
      {required.map((s) => s.attribution_text).join(" ")}
      {sources.some((s) => !s.official_api) && (
        <>
          {" "}
          One or more sources use an unofficial endpoint that is not licensed for
          redistribution.
        </>
      )}
    </p>
  );
}

export function QualityIssues({ issues }: { issues: QualityIssue[] }) {
  if (!issues.length) return null;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return (
    <details className="expand">
      <summary>
        Data-quality findings in this window ({issues.length})
      </summary>
      <p className="small muted">
        {errors.length > 0 && (
          <>
            {errors.length} bar(s) failed structural validation and were excluded
            from the stored series.{" "}
          </>
        )}
        {warnings.length > 0 && <>{warnings.length} warning(s) were recorded. </>}
        Nothing was interpolated to cover them.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Kind</th>
              <th>Severity</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {issues.slice(0, 40).map((issue, i) => (
              <tr key={i}>
                <td className="mono">{issue.at ? issue.at.slice(0, 10) : MISSING}</td>
                <td>{humanise(issue.kind)}</td>
                <td>
                  <Badge variant={issue.severity === "error" ? "down" : "warn"}>
                    {issue.severity}
                  </Badge>
                </td>
                <td className="small">{issue.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * A method's result or the reason it could not run.
 *
 * An unavailable method renders as a visible, explained absence. That is the
 * point: the reader learns the question was asked and could not be answered,
 * rather than never seeing the question.
 */
export function MethodBlock({
  outcome,
  children,
}: {
  outcome: MethodOutcome | undefined;
  children?: ReactNode;
}) {
  if (!outcome) return null;

  if (!outcome.ok) {
    return (
      <Notice variant="warn" title={`${outcome.display_name} — not computed`}>
        {outcome.unavailable_reason ??
          "The method could not run and gave no reason, which is itself a defect."}
      </Notice>
    );
  }

  return (
    <div>
      {children}
      <div className="row tiny subtle mt-1">
        <span className="mono">
          {outcome.key}@{outcome.version}
        </span>
        <span>· {outcome.observations_used} observations</span>
        {outcome.input_fingerprint && (
          <span title="Hash of the exact inputs this figure was computed from, for reproduction">
            · inputs {outcome.input_fingerprint.slice(0, 10)}
          </span>
        )}
      </div>
      {outcome.warnings.length > 0 && (
        <div className="mt-1">
          {outcome.warnings.map((warning, i) => (
            <Notice key={i} variant="warn">
              {warning}
            </Notice>
          ))}
        </div>
      )}
      {outcome.limitations.length > 0 && (
        <details className="expand mt-1">
          <summary>Limitations of this measure ({outcome.limitations.length})</summary>
          <ul className="disclosure-list">
            {outcome.limitations.map((limitation, i) => (
              <li key={i}>{limitation}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="small">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorPanel({
  title,
  message,
  details,
  hint,
}: {
  title: string;
  message: string;
  details?: Record<string, unknown>;
  hint?: ReactNode;
}) {
  const detailEntries = Object.entries(details ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  return (
    <Notice variant="warn" title={title}>
      <p>{message}</p>
      {hint && <p className="small">{hint}</p>}
      {detailEntries.length > 0 && (
        <details className="expand mt-1">
          <summary>Details</summary>
          <table className="data">
            <tbody>
              {detailEntries.map(([key, value]) => (
                <tr key={key}>
                  <th>{humanise(key)}</th>
                  <td className="mono small">
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Notice>
  );
}
