"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PRESETS: Array<{ label: string; days: number }> = [
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
  { label: "3Y", days: 1095 },
  { label: "5Y", days: 1825 },
];

/**
 * Period selector for the historical view.
 *
 * The end date doubles as the analysis cutoff, which is why it is a first-class
 * control rather than a hidden default: moving it changes what the analysis was
 * allowed to see, not just which bars are drawn.
 */
export function PeriodPicker({
  basePath,
  start,
  end,
}: {
  basePath: string;
  start: string;
  end: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);

  function go(nextStart: string, nextEnd: string) {
    const next = new URLSearchParams(params.toString());
    next.set("start", nextStart);
    next.set("end", nextEnd);
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          if (from && to && from < to) go(from, to);
        }}
      >
        <label className="field" style={{ margin: 0 }}>
          <span className="field-label">From</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span className="field-label">To (also the information cutoff)</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-end" }}>
          Analyse period
        </button>
      </form>

      <div className="row">
        <span className="tiny subtle">Ending today:</span>
        <div className="seg">
          {PRESETS.map((preset) => {
            const presetEnd = new Date().toISOString().slice(0, 10);
            const presetStart = new Date(Date.now() - preset.days * 86_400_000)
              .toISOString()
              .slice(0, 10);
            const pressed = from === presetStart && to === presetEnd;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={pressed}
                onClick={() => {
                  setFrom(presetStart);
                  setTo(presetEnd);
                  go(presetStart, presetEnd);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <span className="tiny subtle">Calendar years:</span>
        <div className="seg">
          {[2021, 2022, 2023, 2024].map((year) => {
            const yearStart = `${year}-01-01`;
            const yearEnd = `${year}-12-31`;
            return (
              <button
                key={year}
                type="button"
                aria-pressed={from === yearStart && to === yearEnd}
                onClick={() => {
                  setFrom(yearStart);
                  setTo(yearEnd);
                  go(yearStart, yearEnd);
                }}
              >
                {year}
              </button>
            );
          })}
        </div>
      </div>
      <p className="tiny subtle" style={{ margin: 0 }}>
        The analysis sees only data published on or before the end date. Nothing
        that happened afterwards is visible to it.
      </p>
    </div>
  );
}
