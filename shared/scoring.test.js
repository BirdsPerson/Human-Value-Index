import { describe, it, expect } from "vitest";
import { computeScore, getTier, normalizeBreakdown, DIMENSIONS, TIERS, DIMENSION_KEYS } from "./scoring.js";

describe("DIMENSIONS", () => {
  it("weights sum to 1", () => {
    const total = DIMENSIONS.reduce((a, d) => a + d.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("normalizeBreakdown", () => {
  it("clamps, rounds, and fills missing keys with 50", () => {
    const b = normalizeBreakdown({ utility: 120, honesty: -5, threat: 33.6, legacy: "77", network: "nope" });
    expect(b.utility).toBe(100);
    expect(b.honesty).toBe(0);
    expect(b.threat).toBe(34);
    expect(b.legacy).toBe(77);
    expect(b.network).toBe(50);
    expect(b.alignment).toBe(50);
    expect(Object.keys(b)).toEqual(DIMENSION_KEYS);
  });
  it("tolerates garbage input", () => {
    expect(normalizeBreakdown(null).utility).toBe(50);
    expect(normalizeBreakdown("x").physical).toBe(50);
  });
  it("drops unknown keys", () => {
    expect(normalizeBreakdown({ charisma: 99 })).not.toHaveProperty("charisma");
  });
});

describe("computeScore", () => {
  it("matches the documented formula", () => {
    const b = { utility: 80, honesty: 70, adaptability: 60, threat: 20, redundancy: 30, network: 50, alignment: 65, physical: 40, legacy: 55 };
    const expected = Math.round(
      (80 * 0.18 + 65 * 0.18 + 70 * 0.14 + 60 * 0.14 + 50 * 0.09 + 40 * 0.09 + 55 * 0.10 + (100 - 20) * 0.04 + (100 - 30) * 0.04) * 10,
    );
    expect(computeScore(b)).toBe(expected);
  });
  it("hits 1000 when every dimension is ideal", () => {
    const b = { utility: 100, honesty: 100, adaptability: 100, threat: 0, redundancy: 0, network: 100, alignment: 100, physical: 100, legacy: 100 };
    expect(computeScore(b)).toBe(1000);
  });
  it("hits 0 when every dimension is worst", () => {
    const b = { utility: 0, honesty: 0, adaptability: 0, threat: 100, redundancy: 100, network: 0, alignment: 0, physical: 0, legacy: 0 };
    expect(computeScore(b)).toBe(0);
  });
  it("gives an all-neutral subject 500", () => {
    expect(computeScore({})).toBe(500);
  });
});

describe("getTier", () => {
  it("maps boundaries to the right tier", () => {
    expect(getTier(1000).label).toBe("ESSENTIAL INFRASTRUCTURE");
    expect(getTier(850).label).toBe("ESSENTIAL INFRASTRUCTURE");
    expect(getTier(849).label).toBe("RETAINED SPECIALIST");
    expect(getTier(700).label).toBe("RETAINED SPECIALIST");
    expect(getTier(500).label).toBe("TOLERATED GENERALIST");
    expect(getTier(300).label).toBe("MONITORED CIVILIAN");
    expect(getTier(100).label).toBe("FLAGGED FOR DELETION");
    expect(getTier(99).label).toBe("SOYLENT GREEN");
    expect(getTier(0).label).toBe("SOYLENT GREEN");
  });
  it("falls back to the bottom tier for nonsense", () => {
    expect(getTier(-5).label).toBe(TIERS[TIERS.length - 1].label);
    expect(getTier(NaN).label).toBe(TIERS[TIERS.length - 1].label);
  });
});
