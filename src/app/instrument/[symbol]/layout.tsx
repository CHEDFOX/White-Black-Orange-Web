import Link from "next/link";
import { notFound } from "next/navigation";

import { Tabs } from "@/components/Tabs";
import { Badge, ErrorPanel, FreshnessBadge, Notice } from "@/components/ui";
import { api, attempt } from "@/lib/api";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InstrumentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);
  const [detail, latest] = await Promise.all([
    attempt(api.instrument(decoded)),
    attempt(api.latest(decoded)),
  ]);

  if (!detail.ok) {
    if (detail.error.isNotFound) notFound();
    return (
      <div className="container">
        <ErrorPanel
          title={`Could not load ${decoded}`}
          message={detail.error.message}
          details={detail.error.details}
          hint={
            detail.error.isUnreachable
              ? "Start the backend API and reload."
              : undefined
          }
        />
      </div>
    );
  }

  const instrument = detail.value;
  const base = `/instrument/${encodeURIComponent(instrument.symbol)}`;

  return (
    <div className="container stack">
      <header>
        <div className="row-between">
          <div>
            <div className="row" style={{ alignItems: "baseline" }}>
              <h1 className="mono">{instrument.symbol}</h1>
              <span className="muted">{instrument.name}</span>
            </div>
            <div className="row small subtle mt-1">
              <span>
                {instrument.exchange_name ?? instrument.exchange_code} (
                {instrument.exchange_code})
              </span>
              <span>· {instrument.currency}</span>
              <span>· {instrument.instrument_type}</span>
              {instrument.sector && <span>· {instrument.sector}</span>}
              <FreshnessBadge freshness={instrument.freshness} />
              {!instrument.is_active && <Badge variant="warn">delisted</Badge>}
            </div>
          </div>

          {latest.ok && latest.value.price && (
            <div style={{ textAlign: "right" }}>
              <div className="metric-value" style={{ fontSize: "1.5rem" }}>
                {formatPrice(latest.value.price, latest.value.currency)}
              </div>
              <div className="tiny subtle" title={latest.value.note}>
                last stored close
                {latest.value.at && ` · ${latest.value.at.slice(0, 10)}`}
              </div>
            </div>
          )}
        </div>
      </header>

      {instrument.analysis_caveats.length > 0 && (
        <div>
          {instrument.analysis_caveats
            .filter((c) => !c.startsWith("Curated schedule"))
            .map((caveat, i) => (
              <Notice key={i} variant="warn">
                {caveat}
              </Notice>
            ))}
        </div>
      )}

      <Tabs
        items={[
          { href: base, label: "Overview", exact: true },
          { href: `${base}/past`, label: "Past" },
          { href: `${base}/present`, label: "Present" },
          { href: `${base}/future`, label: "Future" },
          { href: `${base}/risk`, label: "Risk" },
          { href: `${base}/bubble`, label: "Bubble risk" },
          { href: `${base}/report`, label: "Report" },
        ]}
      />

      {children}

      <p className="tiny subtle">
        Instrument metadata and coverage from{" "}
        {instrument.coverage.map((c) => c.source).filter((v, i, a) => a.indexOf(v) === i).join(", ") ||
          "the configured providers"}
        . <Link href="/sources">What each source can and cannot provide</Link>.
      </p>
    </div>
  );
}
