// buildEngineTruth distills the real CLI fixture JSON — these tests pin the
// distillation against the checked-in synthetic Tokyo chart.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { SiderealChart } from "@almamesh/browser/types";

import { buildEngineTruth, normalizeDignity, normalizeYogaName } from "../engineTruth";

const FIXTURES = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), "fixtures");

function loadTokyo(): SiderealChart {
  return JSON.parse(readFileSync(join(FIXTURES, "chart-tokyo-1990.json"), "utf8")) as SiderealChart;
}

describe("normalizeYogaName", () => {
  it("drops case, separators, diacritics and a trailing 'yoga'", () => {
    expect(normalizeYogaName("Budha-Aditya Yoga")).toBe("budhaaditya");
    expect(normalizeYogaName("Gaja Kesari")).toBe("gajakesari");
    expect(normalizeYogaName("Vipareeta Raja Yoga")).toBe("vipareetaraja");
  });
});

describe("normalizeDignity", () => {
  it("maps own_sign to the JSON-boundary 'own'", () => {
    expect(normalizeDignity("own_sign")).toBe("own");
    expect(normalizeDignity("own")).toBe("own");
    expect(normalizeDignity("exalted")).toBe("exalted");
  });
});

describe("buildEngineTruth (Tokyo fixture)", () => {
  const truth = buildEngineTruth(loadTokyo());

  it("captures lordships incl. empty node lordships", () => {
    expect(truth.lordships.get("saturn")).toEqual([7, 8]);
    expect(truth.lordships.get("mars")).toEqual([5, 10]);
    expect(truth.lordships.get("rahu")).toEqual([]);
  });

  it("captures dignities (Sun exalted, Saturn own)", () => {
    expect(truth.dignities.get("sun")).toBe("exalted");
    expect(truth.dignities.get("saturn")).toBe("own");
    expect(truth.dignities.get("moon")).toBe("neutral");
  });

  it("collects the full dated dasha tree (9 mahas, 81 antars, current levels)", () => {
    const mahas = truth.periods.filter((p) => p.level === "maha");
    const antars = truth.periods.filter((p) => p.level === "antar");
    expect(mahas.length).toBeGreaterThanOrEqual(9);
    expect(antars.length).toBeGreaterThanOrEqual(81);
    expect(truth.periods.some((p) => p.level === "pratyantar")).toBe(true);
  });

  it("collects yoga names and categories", () => {
    expect(truth.yogaNames.has("sasa")).toBe(true);
    expect(truth.yogaNames.has("budhaaditya")).toBe(true);
    expect(truth.yogaCategories.has("mahapurusha")).toBe(true);
    expect(truth.yogaNames.has("gajakesari")).toBe(false);
  });
});

describe("fixture hygiene", () => {
  it("chart fixtures are synthetic — PII hard gate", () => {
    for (const name of [
      "chart-bengaluru-1988.json",
      "chart-tokyo-1990.json",
      "chart-saopaulo-1995.json",
    ]) {
      const raw = readFileSync(join(FIXTURES, name), "utf8");
      expect(raw).not.toMatch(/1973|Vadodara|22\.29|73\.19|Harish/i);
    }
  });
});
