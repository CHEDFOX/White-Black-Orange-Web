import { describe, expect, it } from "vitest";

import {
  MISSING,
  daysBefore,
  directionClass,
  formatBigCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatPrice,
  formatRatio,
  formatVolume,
  humanise,
  isMissing,
} from "@/lib/format";

/**
 * The central property under test: a missing value and a zero value must never
 * render the same. "not computed" and "0%" mean different things, and a UI that
 * conflates them misleads silently.
 */
describe("missing versus zero", () => {
  it("renders null as a placeholder and zero as zero", () => {
    expect(formatPercent(null)).toBe(MISSING);
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatNumber(null)).toBe(MISSING);
    expect(formatNumber(0)).toBe("0.00");
    expect(formatPrice(null)).toBe(MISSING);
    expect(formatPrice(0)).toBe("0.0000");
    expect(formatVolume(null)).toBe(MISSING);
    expect(formatVolume(0)).toBe("0");
  });

  it("treats undefined and non-finite values as missing", () => {
    expect(isMissing(undefined)).toBe(true);
    expect(isMissing(Number.NaN)).toBe(true);
    expect(isMissing(Number.POSITIVE_INFINITY)).toBe(true);
    expect(isMissing(0)).toBe(false);
    expect(isMissing("")).toBe(false);
  });

  it("does not treat zero as missing in direction classes", () => {
    expect(directionClass(0)).toBe("neutral");
    expect(directionClass(null)).toBe("neutral");
    expect(directionClass(0.01)).toBe("up");
    expect(directionClass(-0.01)).toBe("down");
  });
});

describe("formatPercent", () => {
  it("converts a fraction to a percentage", () => {
    expect(formatPercent(0.1834, 2)).toBe("18.34%");
    expect(formatPercent(-0.2837, 2)).toBe("-28.37%");
  });

  it("adds a plus sign only when asked and only when positive", () => {
    expect(formatPercent(0.05, 1, { withSign: true })).toBe("+5.0%");
    expect(formatPercent(-0.05, 1, { withSign: true })).toBe("-5.0%");
    expect(formatPercent(0.05, 1)).toBe("5.0%");
  });

  it("respects the digit count", () => {
    expect(formatPercent(0.123456, 0)).toBe("12%");
    expect(formatPercent(0.123456, 4)).toBe("12.3456%");
  });
});

describe("formatPrice", () => {
  it("parses a decimal string without precision loss in the output", () => {
    // Prices arrive from the backend as exact decimal strings.
    expect(formatPrice("182.63")).toBe("182.63");
    expect(formatPrice("4000.00")).toBe("4,000.00");
  });

  it("uses more decimals for sub-unit prices", () => {
    // Two decimals on a price of 0.0842 would hide the entire move.
    expect(formatPrice(0.0842)).toBe("0.0842");
    expect(formatPrice(1.5)).toBe("1.50");
  });

  it("appends a currency when given", () => {
    expect(formatPrice("342.00", "USD")).toBe("342.00 USD");
  });

  it("returns the placeholder for an unparseable string", () => {
    expect(formatPrice("not a number")).toBe(MISSING);
  });
});

describe("formatVolume", () => {
  it("compacts large numbers", () => {
    expect(formatVolume(82_488_700)).toBe("82.49M");
    expect(formatVolume(1_234)).toBe("1.2K");
    expect(formatVolume(2_500_000_000)).toBe("2.50B");
  });

  it("accepts the decimal strings the backend sends", () => {
    expect(formatVolume("82488700.00000000")).toBe("82.49M");
  });
});

describe("formatBigCurrency", () => {
  it("scales to trillions, billions and millions", () => {
    expect(formatBigCurrency(383_285_000_000)).toBe("383.29B USD");
    expect(formatBigCurrency(5_407_891_074_000)).toBe("5.41T USD");
    expect(formatBigCurrency(-1_500_000)).toBe("-1.5M USD");
  });
});

describe("formatDate", () => {
  it("renders an ISO timestamp as a date", () => {
    expect(formatDate("2024-01-02T14:30:00+00:00")).toBe("2024-01-02");
  });

  it("returns the placeholder for null or an invalid value", () => {
    expect(formatDate(null)).toBe(MISSING);
    expect(formatDate("nonsense")).toBe(MISSING);
  });
});

describe("formatRatio", () => {
  it("appends a multiplication sign", () => {
    expect(formatRatio(55.75)).toBe("55.75×");
    expect(formatRatio(null)).toBe(MISSING);
  });
});

describe("humanise", () => {
  it("turns a snake_case key into a sentence", () => {
    expect(humanise("max_drawdown")).toBe("Max drawdown");
    expect(humanise("price_to_earnings")).toBe("Price to earnings");
    expect(humanise("rsi")).toBe("Rsi");
  });
});

describe("daysBefore", () => {
  it("counts back from a fixed reference", () => {
    const from = new Date("2024-03-15T00:00:00Z");
    expect(daysBefore(14, from)).toBe("2024-03-01");
    expect(daysBefore(0, from)).toBe("2024-03-15");
  });
});
