import type { Metadata } from "next";

import { PeriodPicker } from "@/components/PeriodPicker";
import {
  Badge,
  Card,
  ClaimLabel,
  Disclosures,
  ErrorPanel,
  Notice,
} from "@/components/ui";
import { api, attempt } from "@/lib/api";
import { formatDate, formatNumber, humanise } from "@/lib/format";
import type { Calculation, EvidenceItem, Finding, ReportResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol)} report` };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ start?: string; end?: string; kind?: string; narrative?: string }>;
}) {
  const { symbol } = await params;
  const { start, end, kind, narrative } = await searchParams;
  const decoded = decodeURIComponent(symbol);
  const base = `/instrument/${encodeURIComponent(decoded)}/report`;
  const wantNarrative = narrative === "1";
  const reportKind = kind === "current" ? "current" : "historical";

  const historicalStart = start ?? "2022-01-01";
  const historicalEnd = end ?? "2022-12-31";

  const report = await attempt(
    reportKind === "current"
      ? api.currentReport(decoded, { lookbackDays: 400, includeNarrative: wantNarrative })
      : api.historicalReport(decoded, {
          start: `${historicalStart}T00:00:00Z`,
          end: `${historicalEnd}T23:59:59Z`,
          includeNarrative: wantNarrative,
        }),
  );

  return (
    <div className="stack">
      <Card title="Report scope">
        <div className="row mb-2">
          <div className="seg">
            <a
              className="btn btn-sm"
              href={`${base}?kind=historical&start=${historicalStart}&end=${historicalEnd}`}
              aria-current={reportKind === "historical" ? "page" : undefined}
              style={
                reportKind === "historical"
                  ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                  : undefined
              }
            >
              Historical period
            </a>
            <a
              className="btn btn-sm"
              href={`${base}?kind=current`}
              aria-current={reportKind === "current" ? "page" : undefined}
              style={
                reportKind === "current"
                  ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                  : undefined
              }
            >
              Current situation
            </a>
          </div>
        </div>
        {reportKind === "historical" && (
          <PeriodPicker basePath={base} start={historicalStart} end={historicalEnd} />
        )}
      </Card>

      {!report.ok ? (
        <ErrorPanel
          title={
            report.error.isInsufficientData
              ? "Not enough data to generate a report"
              : "Could not generate the report"
          }
          message={report.error.message}
          details={report.error.details}
        />
      ) : (
        <ReportView report={report.value} base={base} wantNarrative={wantNarrative} />
      )}
    </div>
  );
}

function ReportView({
  report,
  base,
  wantNarrative,
}: {
  report: ReportResponse;
  base: string;
  wantNarrative: boolean;
}) {
  const sections = groupBySection(report.findings);

  return (
    <div className="stack">
      <Card
        title={report.title}
        subtitle={
          <>
            Information cutoff {formatDate(report.information_cutoff)} ·
            generated {formatDate(report.created_at)} · generator v
            {report.generator_version}
          </>
        }
      >
        <p>{report.summary}</p>

        <div className="row mt-2">
          {Object.entries(report.claim_kind_counts).map(([kind, count]) => (
            <span key={kind} className="row" style={{ gap: 4, display: "inline-flex" }}>
              <ClaimLabel
                kind={kind as Finding["claim_kind"]}
                title={report.claim_kind_legend[kind]}
              />
              <span className="tiny subtle">×{count}</span>
            </span>
          ))}
        </div>

        <details className="expand mt-2">
          <summary>What each label means</summary>
          <dl className="small">
            {Object.entries(report.claim_kind_legend).map(([kind, meaning]) => (
              <div key={kind} className="mb-1">
                <dt>
                  <ClaimLabel kind={kind as Finding["claim_kind"]} />
                </dt>
                <dd style={{ margin: "3px 0 0" }} className="muted">
                  {meaning}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </Card>

      {report.narrative ? (
        <Card
          title="Narrative"
          subtitle={`Generated by ${report.narrative_model ?? "a language model"} from the findings below`}
          action={<Badge variant="warn">generated prose</Badge>}
        >
          <p>{report.narrative}</p>
          <p className="tiny subtle">
            This paraphrases the structured findings and introduced no figures
            of its own: any number not derivable from the findings causes the
            narrative to be discarded rather than published. The findings below
            are the authoritative content.
          </p>
        </Card>
      ) : (
        <Notice
          variant="info"
          title={wantNarrative ? "No narrative was produced" : "Narrative not requested"}
        >
          {report.narrative_status}
          {!wantNarrative && (
            <>
              {" "}
              <a href={`${base}?narrative=1`}>Request one</a> if a language
              provider is configured. The report is complete without it.
            </>
          )}
        </Notice>
      )}

      {Object.entries(sections).map(([section, findings]) => (
        <Card key={section} title={humanise(section)} id={`section-${section}`}>
          <div className="stack">
            {findings.map((finding, i) => (
              <FindingBlock
                key={i}
                finding={finding}
                legend={report.claim_kind_legend}
              />
            ))}
          </div>
        </Card>
      ))}

      <Card title="Coverage behind this report">
        <div className="table-wrap">
          <table className="data">
            <tbody>
              {Object.entries(report.data_coverage).map(([key, value]) => (
                <tr key={key}>
                  <th style={{ textTransform: "none", fontSize: "0.8125rem" }}>
                    {humanise(key)}
                  </th>
                  <td className="mono small">
                    {Array.isArray(value)
                      ? value.length
                        ? value.join(", ")
                        : "none"
                      : value === null
                        ? "—"
                        : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Limitations of this report">
        <Disclosures items={report.limitations} title="Limitations and disclosures" open />
      </Card>

      <Card title="Reproducing this report">
        <p className="small muted">
          Every figure above names the method version and a fingerprint of the
          exact inputs it was computed from. Re-running the same methods at the
          same information cutoff over the same window reproduces the same
          values and the same reproduction key.
        </p>
        <div className="table-wrap mt-1">
          <table className="data">
            <tbody>
              <tr>
                <th style={{ textTransform: "none" }}>Reproduction key</th>
                <td className="mono small" style={{ wordBreak: "break-all" }}>
                  {report.reproduction_key}
                </td>
              </tr>
              {Object.entries(report.inputs).map(([key, value]) => (
                <tr key={key}>
                  <th style={{ textTransform: "none" }}>{humanise(key)}</th>
                  <td className="mono small">{value === null ? "—" : String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="expand mt-2">
          <summary>Method versions used ({Object.keys(report.method_versions).length})</summary>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {Object.entries(report.method_versions).map(([key, version]) => (
                  <tr key={key}>
                    <td className="mono small">{key}</td>
                    <td className="mono small">v{version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      {report.attribution.length > 0 && (
        <Card title="Data attribution">
          <div className="stack" style={{ gap: 10 }}>
            {report.attribution.map((source) => (
              <div key={source.key}>
                <div className="row">
                  <strong className="mono">{source.key}</strong>
                  <Badge variant={source.official_api ? "default" : "warn"}>
                    {source.official_api ? "official API" : "unofficial endpoint"}
                  </Badge>
                  {!source.redistribution_allowed && (
                    <Badge variant="warn">no redistribution licence</Badge>
                  )}
                </div>
                {source.attribution_text && (
                  <p className="small muted">{source.attribution_text}</p>
                )}
                {source.caveats && <p className="tiny subtle">{source.caveats}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function FindingBlock({
  finding,
  legend,
}: {
  finding: Finding;
  legend: Record<string, string>;
}) {
  return (
    <article
      style={{
        borderLeft: "3px solid var(--border-strong)",
        paddingLeft: 14,
      }}
    >
      <div className="row mb-1">
        <ClaimLabel kind={finding.claim_kind} title={legend[finding.claim_kind]} />
        {finding.confidence_label && (
          <span className="tiny subtle">{finding.confidence_label}</span>
        )}
        {finding.contradicting_count > 0 && (
          <Badge variant="warn">
            {finding.contradicting_count} contradicting
          </Badge>
        )}
      </div>

      <p style={{ fontWeight: 500 }}>{finding.conclusion}</p>

      {finding.uncertainty && (
        <p className="small muted">
          <strong>Uncertainty: </strong>
          {finding.uncertainty}
        </p>
      )}

      {finding.calculations.length > 0 && (
        <details className="expand">
          <summary>Calculations ({finding.calculations.length})</summary>
          <CalculationTable calculations={finding.calculations} />
          {finding.methodology && (
            <p className="small muted mt-1">
              <strong>Method: </strong>
              {finding.methodology}
            </p>
          )}
        </details>
      )}

      {finding.evidence.length > 0 && (
        <details className="expand">
          <summary>
            Evidence ({finding.supporting_count} supporting
            {finding.contradicting_count > 0 &&
              `, ${finding.contradicting_count} contradicting`}
            )
          </summary>
          <EvidenceList evidence={finding.evidence} />
        </details>
      )}

      {finding.limitations.length > 0 && (
        <details className="expand">
          <summary>Limitations ({finding.limitations.length})</summary>
          <ul className="disclosure-list">
            {finding.limitations.map((limitation, i) => (
              <li key={i}>{limitation}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function CalculationTable({ calculations }: { calculations: Calculation[] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Quantity</th>
            <th className="num">Value</th>
            <th>Method</th>
            <th className="num">Observations</th>
            <th>Input fingerprint</th>
          </tr>
        </thead>
        <tbody>
          {calculations.map((calculation, i) => (
            <tr key={i}>
              <td>{calculation.label}</td>
              <td className="num mono">
                {typeof calculation.value === "number"
                  ? formatNumber(calculation.value, 6)
                  : String(calculation.value ?? "—")}
              </td>
              <td className="mono small">
                {calculation.method_key}@{calculation.method_version}
              </td>
              <td className="num mono">{calculation.observations_used}</td>
              <td className="mono tiny">
                {calculation.input_fingerprint?.slice(0, 12) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  const ordered = [...evidence].sort((a, b) => {
    const rank = (stance: string) =>
      stance === "contradicting" ? 0 : stance === "supporting" ? 1 : 2;
    return rank(a.stance) - rank(b.stance);
  });

  return (
    <div className="stack" style={{ gap: 8 }}>
      {ordered.map((item, i) => (
        <div key={i} className="small">
          <div className="row" style={{ gap: 6 }}>
            <Badge
              variant={
                item.stance === "contradicting"
                  ? "warn"
                  : item.stance === "supporting"
                    ? "up"
                    : "default"
              }
            >
              {item.stance}
            </Badge>
            <span className="mono tiny subtle">{item.source_table}</span>
            {item.published_at && (
              <span className="tiny subtle">
                published {formatDate(item.published_at)}
              </span>
            )}
          </div>
          <div className="mt-1">{item.description}</div>
          {item.observed_value && (
            <div className="mono tiny subtle">value: {item.observed_value}</div>
          )}
          {item.url && (
            <a
              className="tiny"
              href={item.url}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              source
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function groupBySection(findings: Finding[]): Record<string, Finding[]> {
  const out: Record<string, Finding[]> = {};
  for (const finding of findings) {
    const list = out[finding.section] ?? [];
    list.push(finding);
    out[finding.section] = list;
  }
  return out;
}
