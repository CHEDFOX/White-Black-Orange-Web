# Stock Intelligence — Web

Frontend for the evidence-driven stock intelligence platform.

Three conventions shape every screen, and they are the reason this is a
purpose-built UI rather than a generic dashboard:

**Every conclusion carries an epistemic label.** A computed return is tagged
*calculated*. A regime classification is tagged *model estimate*. A question
the data cannot answer is tagged *unknown* and shown rather than omitted. The
labels are visually distinct, so a reader can tell an observation from an
estimate at a glance.

**Missing data is rendered, not hidden.** A metric with no value reads "not
available" with the reason beneath it, never a bare dash and never a zero. A
gap in the price record is drawn as a marked break in the chart. A method that
could not run appears as an explained absence, so the reader learns the
question was asked.

**Caveats travel with the figures.** Backend responses carry `disclosures` and
`limitations`, and the components that render analysis also render those. The
`Metric` component requires a reason for an absent value and `Disclosures`
takes its list as a required prop, so a caveat is hard to drop by accident.

## Setup

```bash
npm install
cp .env.example .env.local     # point API_BASE_URL at the backend
npm run dev                    # http://localhost:3000
```

The backend must be running and seeded. In the backend repository:

```bash
alembic upgrade head
python -m scripts.seed         # real data, no API key needed
uvicorn app.main:app
```

## Architecture

Server Components call the backend through `src/lib/api.ts`. Every call runs on
the server, so the browser never learns the backend's address and never holds
an API key. Three components are client-side, and only because they need to
be: the Canvas chart, the route tabs (which read the active path), and the form
controls.

```
src/
  app/
    page.tsx                      search entry and what is loaded
    search/                       instrument search and the full registry
    sources/                      data sources, licensing, limitations
    instrument/[symbol]/
      layout.tsx                  header, freshness, tab navigation
      page.tsx                    overview, chart, coverage
      past/                       point-in-time historical reconstruction
      present/                    current technicals and diagnostics
      future/                     forecast distribution and its track record
      risk/                       volatility, tail risk, gap risk, sizing
      bubble/                     multi-signal speculative-risk assessment
      report/                     evidence-linked findings
  components/
    PriceChart.tsx                Canvas candlesticks, volume, gaps, forecast fan
    ui.tsx                        Metric, ClaimLabel, Disclosures, MethodBlock
    MethodTable.tsx               a method's outputs, with absences explained
    Tabs.tsx, PeriodPicker.tsx, ForecastControls.tsx, SearchBox.tsx
  lib/
    api.ts                        server-side backend client
    types.ts                      response types mirroring the backend
    format.ts                     formatters that distinguish missing from zero
```

### The chart

`PriceChart` is written against Canvas rather than built on a charting library,
for three product reasons:

1. Prices arrive as exact decimal strings and are parsed once, at the boundary,
   with the original string kept for the readout.
2. Gaps must be visible. Libraries typically either join across a missing
   session or drop it silently; here a recorded gap is drawn as a marked break.
3. Direction is encoded twice — colour *and* a filled versus hollow body — so
   the chart is readable without colour vision.

The x axis is categorical, one slot per bar, so weekends leave no false empty
space; real missing sessions are marked explicitly instead.

## Tests

```bash
npm test          # unit tests
npm run typecheck
npm run lint
npm run build
```

The tests concentrate on the formatting layer, because that is where a missing
value could silently become a zero, and on the API client's error
classification, because a 409 `insufficient_data` must reach the user as an
explanation rather than a generic failure.

## Disclaimer

Research and educational tooling. Not personalised investment advice, not a
recommendation to buy or sell, and no account of any individual's
circumstances. No trade execution.
