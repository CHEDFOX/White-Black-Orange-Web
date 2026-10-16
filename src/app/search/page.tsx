import Link from "next/link";
import type { Metadata } from "next";

import { SearchBox } from "@/components/SearchBox";
import { Badge, Card, EmptyState, ErrorPanel, Notice } from "@/components/ui";
import { api, attempt } from "@/lib/api";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (!query) {
    const listing = await attempt(api.listInstruments({ limit: 200 }));
    return (
      <div className="container stack">
        <h1>Search instruments</h1>
        <SearchBox autoFocus />
        {listing.ok ? (
          <Card
            title={`${listing.value.total} instrument${listing.value.total === 1 ? "" : "s"} ingested`}
            subtitle="The registry holds what has been ingested, not a global universe."
          >
            {listing.value.note && <Notice variant="warn">{listing.value.note}</Notice>}
            <ResultTable instruments={listing.value.instruments} />
          </Card>
        ) : (
          <ErrorPanel
            title="Could not list instruments"
            message={listing.error.message}
            details={listing.error.details}
          />
        )}
      </div>
    );
  }

  const result = await attempt(api.searchInstruments(query, { onlyWithPrices: false }));

  return (
    <div className="container stack">
      <h1>Search</h1>
      <SearchBox initialQuery={query} />

      {!result.ok ? (
        <ErrorPanel
          title="Search failed"
          message={result.error.message}
          details={result.error.details}
        />
      ) : result.value.results.length === 0 ? (
        <EmptyState title={`Nothing matches “${query}”`}>
          {result.value.note ??
            "No registered instrument matches that query."}
        </EmptyState>
      ) : (
        <Card
          title={`${result.value.returned} result${result.value.returned === 1 ? "" : "s"} for “${query}”`}
          subtitle="Ranked by exact symbol, then symbol prefix, then name."
        >
          <ResultTable instruments={result.value.results} />
        </Card>
      )}
    </div>
  );
}

function ResultTable({
  instruments,
}: {
  instruments: Array<{
    id: string;
    symbol: string;
    name: string;
    exchange_code: string;
    exchange_name: string | null;
    instrument_type: string;
    currency: string;
    is_active: boolean;
    listed_on: string | null;
  }>;
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Venue</th>
            <th>Type</th>
            <th>Currency</th>
            <th>Listed</th>
          </tr>
        </thead>
        <tbody>
          {instruments.map((instrument) => (
            <tr key={instrument.id}>
              <td>
                <Link href={`/instrument/${encodeURIComponent(instrument.symbol)}`}>
                  <strong className="mono">{instrument.symbol}</strong>
                </Link>
                {!instrument.is_active && (
                  <>
                    {" "}
                    <Badge variant="warn">delisted</Badge>
                  </>
                )}
              </td>
              <td>{instrument.name}</td>
              <td className="small">
                {instrument.exchange_name ?? instrument.exchange_code}
                <span className="subtle"> ({instrument.exchange_code})</span>
              </td>
              <td className="small">{instrument.instrument_type}</td>
              <td className="small mono">{instrument.currency}</td>
              <td className="small mono">{formatDate(instrument.listed_on)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
