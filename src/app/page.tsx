import Link from "next/link";

import { SearchBox } from "@/components/SearchBox";
import { Card, EmptyState, ErrorPanel, Notice } from "@/components/ui";
import { api, attempt } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Offer whatever is actually ingested as starting points, rather than
  // hardcoding tickers this deployment may not hold.
  const [health, sources, listing] = await Promise.all([
    attempt(api.health()),
    attempt(api.dataSources(false)),
    attempt(api.listInstruments({ limit: 12 })),
  ]);
  const examples = listing.ok ? listing.value.instruments : [];

  return (
    <div className="container stack">
      <section>
        <h1>Evidence-driven stock analysis</h1>
        <p className="muted" style={{ maxWidth: "62ch" }}>
          Search a supported instrument, pick a period, and see what the record
          actually shows. Every figure names the method and inputs that produced
          it, every estimate is labelled as an estimate, and anything the data
          cannot answer is reported as unanswered rather than filled in.
        </p>
        <div className="mt-2" style={{ maxWidth: "520px" }}>
          <SearchBox autoFocus />
        </div>
      </section>

      {!health.ok && (
        <ErrorPanel
          title="The backend is not reachable"
          message={health.error.message}
          details={health.error.details}
          hint={
            <>
              Start the API with <code>uvicorn app.main:app</code> in the backend
              repository, then reload. Set <code>API_BASE_URL</code> if it runs
              on another host.
            </>
          }
        />
      )}

      {health.ok && health.value.instruments === 0 && (
        <Notice variant="warn" title="No instruments are ingested yet">
          The backend is running but its registry is empty. Run{" "}
          <code>python -m scripts.seed</code> in the backend repository to ingest
          real price history, fundamentals and macro series. Coverage is limited
          to what has been ingested; this is not a global universe.
        </Notice>
      )}

      {health.ok && health.value.instruments > 0 && (
        <Card
          title="What is loaded"
          subtitle="Coverage is limited to instruments that have been ingested."
        >
          <div className="grid grid-4">
            <div className="metric">
              <div className="metric-label">Instruments</div>
              <div className="metric-value">{health.value.instruments}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Price bars</div>
              <div className="metric-value">
                {health.value.price_bars.toLocaleString("en-US")}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Environment</div>
              <div className="metric-value" style={{ fontSize: "1rem" }}>
                {health.value.environment}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Database</div>
              <div className="metric-value" style={{ fontSize: "1rem" }}>
                {health.value.database}
              </div>
            </div>
          </div>

          {examples.length > 0 && (
            <div className="mt-2">
              <div className="field-label">Ingested instruments</div>
              <div className="row">
                {examples.map((instrument) => (
                  <Link
                    key={instrument.id}
                    className="btn btn-sm"
                    href={`/instrument/${encodeURIComponent(instrument.symbol)}`}
                  >
                    {instrument.symbol}
                    <span className="subtle tiny">{instrument.exchange_code}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title="How this platform treats a conclusion">
        <div className="grid grid-2">
          <div>
            <h3>Labels, not assertions</h3>
            <p className="small muted">
              A computed return is a <em>calculation</em>. A regime label is a{" "}
              <em>model estimate</em>. A proposed cause is a{" "}
              <em>hypothesis</em>. Nothing is presented as an observed fact
              unless it was observed, and a question the data cannot answer is
              labelled <em>unknown</em>.
            </p>
          </div>
          <div>
            <h3>Missing data is shown</h3>
            <p className="small muted">
              Nothing is interpolated, forward-filled or defaulted to zero. A
              gap in the record appears as a marked break in the chart and as a
              finding in the report. A method that lacks the data to run says so
              and says why.
            </p>
          </div>
          <div>
            <h3>Point-in-time by construction</h3>
            <p className="small muted">
              A historical analysis sees only what had been published by the end
              of its window. A restated financial figure is invisible to an
              analysis dated before the restatement, so a reconstruction shows
              what an analyst genuinely had.
            </p>
          </div>
          <div>
            <h3>Forecasts carry their own scorecard</h3>
            <p className="small muted">
              Every forecast is shown with that model&apos;s out-of-sample
              walk-forward performance against a random-walk baseline. Where the
              model does not beat the baseline, the page says so.
            </p>
          </div>
        </div>
      </Card>

      {sources.ok && (
        <Card
          title="Data sources"
          action={
            <Link className="btn btn-sm" href="/sources">
              Details
            </Link>
          }
        >
          <div className="row">
            {sources.value.sources
              .filter((s) => s.active)
              .map((source) => (
                <span key={source.key} className="badge">
                  {source.key}
                  {source.supports_point_in_time && (
                    <span title="Supports point-in-time reconstruction">· PIT</span>
                  )}
                </span>
              ))}
          </div>
          <p className="tiny subtle mt-1">{sources.value.note}</p>
        </Card>
      )}

      {health.ok && health.value.instruments === 0 && examples.length === 0 && (
        <EmptyState title="Nothing to analyse yet">
          Ingest data in the backend, then search for an instrument here.
        </EmptyState>
      )}
    </div>
  );
}
