"use client";

/**
 * Candlestick and volume chart drawn on a Canvas.
 *
 * Written by hand rather than with a charting library for three reasons that
 * matter to this product:
 *
 * 1. **Prices arrive as decimal strings** and must be parsed once, at the
 *    boundary, with the original string kept for the readout. A library that
 *    takes numbers would force a lossy conversion before the chart is drawn.
 * 2. **Gaps must be visible.** Most libraries either join across a missing
 *    session or drop it silently. Here a gap in the data is drawn as a marked
 *    break, because the platform's promise is that holes are shown.
 * 3. **Direction is encoded twice** — colour *and* a filled versus hollow body
 *    — so the chart is readable without colour vision.
 *
 * The x axis is categorical (one slot per bar), not time-proportional, so
 * weekends and holidays leave no false empty space. Real missing sessions are
 * marked explicitly instead.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatDate, formatPrice, formatVolume } from "@/lib/format";
import type { Candle, DataGap } from "@/lib/types";

export interface ChartEvent {
  at: string;
  label: string;
  category: string;
  importance?: number;
}

interface Props {
  candles: Candle[];
  currency: string;
  gaps?: DataGap[];
  events?: ChartEvent[];
  /** Overlay a comparable historical window, normalised to the same start. */
  overlay?: { label: string; closes: number[] } | null;
  /** Forecast quantile bands projected beyond the last bar. */
  forecast?: {
    label: string;
    horizonBars: number;
    levels: Record<string, number>;
  } | null;
  height?: number;
  showVolume?: boolean;
  ariaLabel?: string;
}

interface ParsedBar {
  index: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  revision: number;
  raw: Candle;
}

const PADDING = { top: 14, right: 62, bottom: 24, left: 10 } as const;
const VOLUME_FRACTION = 0.2;

function parseCandles(candles: Candle[]): ParsedBar[] {
  const out: ParsedBar[] = [];
  candles.forEach((c, index) => {
    const open = Number.parseFloat(c.o);
    const high = Number.parseFloat(c.h);
    const low = Number.parseFloat(c.l);
    const close = Number.parseFloat(c.c);
    // A bar that cannot be parsed is dropped rather than drawn as zero, which
    // would put a spike to the axis floor on the chart.
    if (![open, high, low, close].every(Number.isFinite)) return;
    const volume = c.v === null ? null : Number.parseFloat(c.v);
    out.push({
      index,
      time: c.t,
      open,
      high,
      low,
      close,
      volume: volume !== null && Number.isFinite(volume) ? volume : null,
      revision: c.revision,
      raw: c,
    });
  });
  return out;
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const span = max - min;
  const rawStep = span / Math.max(count, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function PriceChart({
  candles,
  currency,
  gaps = [],
  events = [],
  overlay = null,
  forecast = null,
  height = 380,
  showVolume = true,
  ariaLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(880);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // The resolved colour scheme, not a counter: the palette below is derived
  // from CSS custom properties whose values depend on it, so the scheme is a
  // real input to the palette rather than an opaque cache-busting signal.
  const [scheme, setScheme] = useState<"light" | "dark">("light");

  const bars = useMemo(() => parseCandles(candles), [candles]);

  /** Bar indices immediately after a recorded gap, for the break markers. */
  const gapIndices = useMemo(() => {
    if (!gaps.length || !bars.length) return new Set<number>();
    const set = new Set<number>();
    for (const gap of gaps) {
      const gapEnd = new Date(gap.gap_end).getTime();
      if (Number.isNaN(gapEnd)) continue;
      const next = bars.findIndex((b) => new Date(b.time).getTime() > gapEnd);
      if (next > 0) set.add(next);
    }
    return set;
  }, [gaps, bars]);

  const eventsBySlot = useMemo(() => {
    const map = new Map<number, ChartEvent[]>();
    if (!bars.length) return map;
    const times = bars.map((b) => new Date(b.time).getTime());
    for (const event of events) {
      const at = new Date(event.at).getTime();
      if (Number.isNaN(at)) continue;
      // Nearest bar at or before the event.
      let slot = -1;
      for (let i = 0; i < times.length; i += 1) {
        const t = times[i];
        if (t !== undefined && t <= at) slot = i;
        else break;
      }
      if (slot < 0) continue;
      const list = map.get(slot) ?? [];
      list.push(event);
      map.set(slot, list);
    }
    return map;
  }, [events, bars]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  // Track the colour scheme so the palette is rebuilt when it changes. The
  // CSS variables are read at paint time, so without this the chart keeps the
  // colours it was first drawn with.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setScheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /** The palette for the current colour scheme, read from CSS variables. */
  const colors = useMemo(
    () => ({
      scheme,
      bg: cssVar("--bg-raised", "#ffffff"),
      grid: cssVar("--border", "#e2e2e6"),
      gridStrong: cssVar("--border-strong", "#c9c9d0"),
      text: cssVar("--fg-muted", "#55555e"),
      textSubtle: cssVar("--fg-subtle", "#80808c"),
      up: cssVar("--up", "#0b7a4b"),
      down: cssVar("--down", "#c92a2a"),
      brand: cssVar("--brand", "#e8590c"),
      warn: cssVar("--warn", "#9a6700"),
      info: cssVar("--info", "#1a5fb4"),
      fontSans: cssVar("--font-sans", "sans-serif"),
      fontMono: cssVar("--font-mono", "monospace"),
    }),
    [scheme],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    if (!bars.length) {
      ctx.fillStyle = colors.textSubtle;
      ctx.font = `13px ${colors.fontSans}`;
      ctx.textAlign = "center";
      ctx.fillText("No price data for this window", width / 2, height / 2);
      return;
    }

    const volumeHeight = showVolume ? Math.round(height * VOLUME_FRACTION) : 0;
    const plotLeft = PADDING.left;
    const plotRight = width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = height - PADDING.bottom - volumeHeight;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);

    // Reserve slots for the forecast projection so it is not drawn off-canvas.
    const forecastSlots = forecast ? Math.min(forecast.horizonBars, 60) : 0;
    const totalSlots = bars.length + forecastSlots;
    const slotWidth = plotWidth / totalSlots;
    const bodyWidth = Math.max(1, Math.min(slotWidth * 0.68, 14));

    let min = Infinity;
    let max = -Infinity;
    for (const bar of bars) {
      if (bar.low < min) min = bar.low;
      if (bar.high > max) max = bar.high;
    }
    if (overlay?.closes.length) {
      // Normalise the overlay to the window's first close so two different
      // price levels are comparable in shape.
      const first = bars[0]?.close ?? 1;
      const overlayFirst = overlay.closes[0] ?? 1;
      for (const close of overlay.closes) {
        const scaled = (close / overlayFirst) * first;
        if (scaled < min) min = scaled;
        if (scaled > max) max = scaled;
      }
    }
    if (forecast) {
      for (const level of Object.values(forecast.levels)) {
        if (level < min) min = level;
        if (level > max) max = level;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
      const mid = Number.isFinite(min) ? min : 1;
      min = mid * 0.98;
      max = mid * 1.02;
    }
    const pad = (max - min) * 0.06;
    min -= pad;
    max += pad;

    const yOf = (price: number) =>
      plotBottom - ((price - min) / (max - min)) * plotHeight;
    const xOf = (slot: number) => plotLeft + slot * slotWidth + slotWidth / 2;

    // --- grid and price axis ------------------------------------------------
    ctx.font = `11px ${colors.fontMono}`;
    ctx.textBaseline = "middle";
    const ticks = niceTicks(min, max, Math.max(3, Math.floor(plotHeight / 52)));
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (const tick of ticks) {
      const y = Math.round(yOf(tick)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
      ctx.fillStyle = colors.textSubtle;
      ctx.textAlign = "left";
      ctx.fillText(tick.toFixed(tick < 10 ? 2 : tick < 1000 ? 1 : 0), plotRight + 6, y);
    }

    // --- volume -------------------------------------------------------------
    if (showVolume && volumeHeight > 0) {
      const volumes = bars.map((b) => b.volume ?? 0);
      const maxVolume = Math.max(...volumes, 1);
      const volTop = plotBottom + 10;
      const volBottom = height - PADDING.bottom;
      const volSpan = Math.max(1, volBottom - volTop);
      bars.forEach((bar) => {
        if (bar.volume === null) return;
        const h = (bar.volume / maxVolume) * volSpan;
        const rising = bar.close >= bar.open;
        ctx.fillStyle = rising ? colors.up : colors.down;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(
          xOf(bar.index) - bodyWidth / 2,
          volBottom - h,
          bodyWidth,
          Math.max(h, 0.5),
        );
        ctx.globalAlpha = 1;
      });
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      ctx.moveTo(plotLeft, Math.round(volTop) + 0.5);
      ctx.lineTo(plotRight, Math.round(volTop) + 0.5);
      ctx.stroke();
    }

    // --- gap breaks ---------------------------------------------------------
    // Drawn before the candles so a marker never hides a bar.
    ctx.save();
    ctx.strokeStyle = colors.warn;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (const slot of gapIndices) {
      const x = Math.round(xOf(slot) - slotWidth / 2) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
    }
    ctx.restore();

    // --- candles ------------------------------------------------------------
    bars.forEach((bar) => {
      const x = xOf(bar.index);
      const rising = bar.close >= bar.open;
      const color = rising ? colors.up : colors.down;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;

      // Wick.
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, yOf(bar.high));
      ctx.lineTo(Math.round(x) + 0.5, yOf(bar.low));
      ctx.stroke();

      // Body: hollow when rising, filled when falling, so direction survives
      // without colour.
      const yOpen = yOf(bar.open);
      const yClose = yOf(bar.close);
      const top = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);
      const left = x - bodyWidth / 2;
      if (rising) {
        ctx.fillStyle = colors.bg;
        ctx.fillRect(left, top, bodyWidth, bodyHeight);
        ctx.strokeRect(
          Math.round(left) + 0.5,
          Math.round(top) + 0.5,
          Math.round(bodyWidth),
          Math.round(bodyHeight),
        );
      } else {
        ctx.fillRect(left, top, bodyWidth, bodyHeight);
      }
    });

    // --- overlay ------------------------------------------------------------
    if (overlay?.closes.length) {
      const first = bars[0]?.close ?? 1;
      const overlayFirst = overlay.closes[0] ?? 1;
      ctx.save();
      ctx.strokeStyle = colors.info;
      ctx.lineWidth = 1.75;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      overlay.closes.forEach((close, i) => {
        if (i >= bars.length) return;
        const y = yOf((close / overlayFirst) * first);
        const x = xOf(i);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // --- forecast fan -------------------------------------------------------
    if (forecast && forecastSlots > 0) {
      const lastBar = bars[bars.length - 1];
      if (lastBar) {
        const startX = xOf(lastBar.index);
        const endX = xOf(bars.length - 1 + forecastSlots);
        const levels = Object.entries(forecast.levels)
          .map(([q, price]) => ({ q: Number.parseFloat(q), price }))
          .filter((l) => Number.isFinite(l.q) && Number.isFinite(l.price))
          .sort((a, b) => a.q - b.q);

        // Shade symmetric quantile pairs from the outside in, so the central
        // interval reads darkest.
        for (let i = 0; i < Math.floor(levels.length / 2); i += 1) {
          const lower = levels[i];
          const upper = levels[levels.length - 1 - i];
          if (!lower || !upper) continue;
          ctx.fillStyle = colors.brand;
          ctx.globalAlpha = 0.07 + i * 0.05;
          ctx.beginPath();
          ctx.moveTo(startX, yOf(lastBar.close));
          ctx.lineTo(endX, yOf(upper.price));
          ctx.lineTo(endX, yOf(lower.price));
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        const median = levels.find((l) => Math.abs(l.q - 0.5) < 1e-9);
        if (median) {
          ctx.save();
          ctx.strokeStyle = colors.brand;
          ctx.lineWidth = 1.75;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(startX, yOf(lastBar.close));
          ctx.lineTo(endX, yOf(median.price));
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.strokeStyle = colors.gridStrong;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(startX) + 0.5, plotTop);
        ctx.lineTo(Math.round(startX) + 0.5, plotBottom);
        ctx.stroke();
        ctx.restore();
      }
    }

    // --- event markers ------------------------------------------------------
    ctx.font = `10px ${colors.fontSans}`;
    for (const [slot, list] of eventsBySlot) {
      const bar = bars[slot];
      if (!bar) continue;
      const x = xOf(slot);
      const y = yOf(bar.low) + 9;
      ctx.fillStyle = colors.brand;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 7);
      ctx.lineTo(x + 4, y + 7);
      ctx.closePath();
      ctx.fill();
      if (list.length > 1) {
        ctx.fillStyle = colors.text;
        ctx.textAlign = "center";
        ctx.fillText(String(list.length), x, y + 15);
      }
    }

    // --- time axis ----------------------------------------------------------
    ctx.fillStyle = colors.textSubtle;
    ctx.font = `11px ${colors.fontMono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelEvery = Math.max(1, Math.ceil(bars.length / Math.floor(plotWidth / 78)));
    bars.forEach((bar, i) => {
      if (i % labelEvery !== 0) return;
      ctx.fillText(formatDate(bar.time), xOf(i), height - PADDING.bottom + 6);
    });

    // --- crosshair ----------------------------------------------------------
    if (hoverIndex !== null) {
      const bar = bars[hoverIndex];
      if (bar) {
        ctx.save();
        ctx.strokeStyle = colors.gridStrong;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        const x = Math.round(xOf(hoverIndex)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, plotTop);
        ctx.lineTo(x, height - PADDING.bottom);
        ctx.stroke();
        const y = Math.round(yOf(bar.close)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = colors.gridStrong;
        ctx.fillRect(plotRight, y - 9, PADDING.right, 18);
        ctx.fillStyle = colors.bg;
        ctx.font = `11px ${colors.fontMono}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(bar.close.toFixed(2), plotRight + 6, y);
      }
    }
  }, [
    bars, width, height, showVolume, hoverIndex, gapIndices,
    eventsBySlot, overlay, forecast, colors,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  const slotFromClientX = useCallback(
    (clientX: number): number | null => {
      const canvas = canvasRef.current;
      if (!canvas || !bars.length) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const plotLeft = PADDING.left;
      const plotWidth = Math.max(1, width - PADDING.right - plotLeft);
      const forecastSlots = forecast ? Math.min(forecast.horizonBars, 60) : 0;
      const slotWidth = plotWidth / (bars.length + forecastSlots);
      const slot = Math.floor((x - plotLeft) / slotWidth);
      if (slot < 0 || slot >= bars.length) return null;
      return slot;
    },
    [bars.length, width, forecast],
  );

  const hovered = hoverIndex === null ? null : bars[hoverIndex] ?? null;
  const change =
    hovered && hoverIndex !== null && hoverIndex > 0
      ? (() => {
          const prev = bars[hoverIndex - 1];
          return prev ? hovered.close / prev.close - 1 : null;
        })()
      : null;

  const hoveredEvents = hoverIndex === null ? [] : eventsBySlot.get(hoverIndex) ?? [];

  return (
    <div className="chart-shell" ref={shellRef}>
      <canvas
        ref={canvasRef}
        className="chart-canvas"
        style={{ width: "100%" }}
        role="img"
        aria-label={
          ariaLabel ??
          `Candlestick chart of ${bars.length} bars from ${
            bars.length ? formatDate(bars[0]!.time) : "no data"
          } to ${bars.length ? formatDate(bars[bars.length - 1]!.time) : "no data"}`
        }
        onMouseMove={(e) => setHoverIndex(slotFromClientX(e.clientX))}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) setHoverIndex(slotFromClientX(touch.clientX));
        }}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (touch) setHoverIndex(slotFromClientX(touch.clientX));
        }}
      />
      <dl className="chart-readout" aria-live="polite">
        {hovered ? (
          <>
            <div>
              <dt>Date</dt>
              <dd>{formatDate(hovered.time)}</dd>
            </div>
            <div>
              <dt>O</dt>
              <dd>{formatPrice(hovered.raw.o)}</dd>
            </div>
            <div>
              <dt>H</dt>
              <dd>{formatPrice(hovered.raw.h)}</dd>
            </div>
            <div>
              <dt>L</dt>
              <dd>{formatPrice(hovered.raw.l)}</dd>
            </div>
            <div>
              <dt>C</dt>
              <dd>{formatPrice(hovered.raw.c, currency)}</dd>
            </div>
            <div>
              <dt>Vol</dt>
              <dd>{formatVolume(hovered.raw.v)}</dd>
            </div>
            {change !== null && (
              <div>
                <dt>Chg</dt>
                <dd className={change > 0 ? "up" : change < 0 ? "down" : "neutral"}>
                  {(change * 100).toFixed(2)}%
                </dd>
              </div>
            )}
            {hovered.revision > 0 && (
              <div>
                <dt>Rev</dt>
                <dd title="This bar is a corrected revision of an earlier value">
                  r{hovered.revision}
                </dd>
              </div>
            )}
            {hoveredEvents.length > 0 && (
              <div>
                <dt>Event</dt>
                <dd>{hoveredEvents.map((e) => e.label).join("; ")}</dd>
              </div>
            )}
          </>
        ) : (
          <div className="subtle">
            Hover or tap the chart for the values of a single bar
          </div>
        )}
      </dl>
    </div>
  );
}
