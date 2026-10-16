import type { Metadata } from "next";

import { Badge, Card, ErrorPanel, Notice } from "@/components/ui";
import { api, attempt } from "@/lib/api";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Data sources and limitations" };

export default async function SourcesPage() {
  const [sources, limitations, methods] = await Promise.all([
    attempt(api.dataSources(false)),
    attempt(api.limitations()),
    attempt(api.methods()),
  ]);

  return (
    <div className="container stack">
      <header>
        <h1>Data sources and limitations</h1>
        <p className="muted" style={{ maxWidth: "66ch" }}>
          What this platform reads, what each source can and cannot provide, and
          what the analysis therefore does not know. Served from the backend so
          a client cannot display analysis without being able to show the
          caveats.
        </p>
      </header>

      {!sources.ok ? (
        <ErrorPanel
          title="Could not load data sources"
          message={sources.error.message}
          details={sources.error.details}
        />
      ) : (
        <Card title="Configured sources">
          <p className="small muted">{sources.value.note}</p>
          <div className="stack mt-2">
            {sources.value.sources.map((source) => (
              <div
                key={source.key}
                style={{
                  borderLeft: `3px solid ${source.active ? "var(--up)" : "var(--border-strong)"}`,
                  paddingLeft: 14,
                }}
              >
                <div className="row">
                  <strong className="mono">{source.key}</strong>
                  <span className="muted small">{source.display_name}</span>
                  {source.active ? (
                    <Badge variant="up">active</Badge>
                  ) : (
                    <Badge variant="warn">inactive</Badge>
                  )}
                  {source.supports_point_in_time && (
                    <Badge
                      variant="info"
                      title="Can reconstruct what was knowable at a past instant"
                    >
                      point-in-time
                    </Badge>
                  )}
                  <Badge variant={source.official_api ? "default" : "warn"}>
                    {source.official_api ? "official API" : "unofficial endpoint"}
                  </Badge>
                  {!source.redistribution_allowed && (
                    <Badge variant="warn">no redistribution licence</Badge>
                  )}
                  {source.classification === "synthetic" && (
                    <Badge variant="down">synthetic — test data only</Badge>
                  )}
                </div>

                {source.unavailable_reason && (
                  <Notice variant="warn" title="Why this source is inactive">
                    {source.unavailable_reason}
                  </Notice>
                )}

                {source.kinds.length > 0 && (
                  <p className="small mt-1">
                    <strong>Provides: </strong>
                    {source.kinds.map(humanise).join(", ")}
                    {source.resolutions && source.resolutions.length > 0 && (
                      <>
                        {" · "}
                        <span className="mono">{source.resolutions.join(", ")}</span>
                      </>
                    )}
                  </p>
                )}

                {source.licence_summary && (
                  <p className="small muted">{source.licence_summary}</p>
                )}

                {source.caveats.filter(Boolean).length > 0 && (
                  <details className="expand mt-1">
                    <summary>
                      Caveats ({source.caveats.filter(Boolean).length})
                    </summary>
                    <ul className="disclosure-list">
                      {source.caveats.filter(Boolean).map((caveat, i) => (
                        <li key={i}>{caveat}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {limitations.ok && (
        <Card title="What this platform does not know">
          <div className="stack">
            {(Object.entries(limitations.value) as Array<[string, string[]]>).map(
              ([group, items]) => (
                <div key={group}>
                  <h3>{humanise(group)}</h3>
                  <ul className="disclosure-list">
                    {items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        </Card>
      )}

      {methods.ok && (
        <Card
          title="Analysis methods"
          subtitle={`${methods.value.count} registered methods, each declaring its inputs, minimum data and limitations`}
        >
          <div className="row mb-2">
            {Object.entries(methods.value.families).map(([family, count]) => (
              <Badge key={family}>
                {humanise(family)} · {count}
              </Badge>
            ))}
          </div>
          <details className="expand">
            <summary>Every registered method</summary>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Family</th>
                    <th className="num">Min obs</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.value.methods.map((method) => (
                    <tr key={String(method["key"])}>
                      <td>
                        <span className="mono small">
                          {String(method["key"])}@{String(method["version"])}
                        </span>
                        <div className="tiny subtle">
                          {String(method["display_name"])}
                        </div>
                      </td>
                      <td className="small">{humanise(String(method["family"]))}</td>
                      <td className="num mono">{String(method["min_observations"])}</td>
                      <td className="small">
                        {humanise(String(method["validation_status"]))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      )}

      <Card title="Regulatory posture">
        <p>
          This platform is research and educational tooling. It does not provide
          personalised investment advice, does not make recommendations, and
          takes no account of any individual&apos;s circumstances, objectives or
          risk tolerance.
        </p>
        <p>
          It does not execute trades. No execution subsystem exists, and none
          would be added without separate review, explicit user authorisation
          and independent risk controls.
        </p>
        <p className="small muted">
          Backtest and walk-forward results are hypothetical and are not actual
          trading performance. Unless the recorded execution assumptions say
          otherwise, they are gross of costs and slippage.
        </p>
      </Card>
    </div>
  );
}
