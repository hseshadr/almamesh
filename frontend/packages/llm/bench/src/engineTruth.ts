// Distill an engine chart JSON (SiderealChart, the CLI/`model_dump` shape)
// into the mechanical ground truth the fence checker compares narration
// against. Pure reshaping — NO astrology is computed here (engine rule #2).

import type { SiderealChart } from "@almamesh/browser/types";

import type { DashaLevel, EngineTruth, TruthPeriod } from "./types";

/** Normalize a yoga name for membership checks: lowercase, drop separators + a trailing "yoga". */
export function normalizeYogaName(name: string): string {
  const flat = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return flat.replace(/yogas?$/, "");
}

/** Engine dignity vocabulary normalized: the JSON boundary emits "own" (not "own_sign"). */
export function normalizeDignity(value: string): string {
  return value === "own_sign" ? "own" : value;
}

interface RawPeriod {
  readonly lord: string;
  readonly start_date: string;
  readonly end_date: string;
}

function toPeriod(level: DashaLevel, p: RawPeriod): TruthPeriod {
  return {
    lord: p.lord.toLowerCase(),
    level,
    start: new Date(p.start_date),
    end: new Date(p.end_date),
  };
}

/** Build the fence checker's ground truth from one engine chart JSON. */
export function buildEngineTruth(chart: SiderealChart): EngineTruth {
  const lordships = new Map<string, readonly number[]>();
  const dignities = new Map<string, string>();
  for (const planet of Object.values(chart.planets)) {
    const name = planet.name.toLowerCase();
    lordships.set(name, [...planet.houses_ruled]);
    dignities.set(name, normalizeDignity(planet.dignity));
  }

  const periods: TruthPeriod[] = [];
  const dashas = chart.dashas;
  for (const maha of dashas.maha_dasha_sequence) {
    periods.push(toPeriod("maha", maha));
    for (const antar of maha.antar_sequence ?? []) {
      periods.push(toPeriod("antar", antar));
    }
  }
  for (const [level, current] of [
    ["maha", dashas.current_maha],
    ["antar", dashas.current_antar],
    ["pratyantar", dashas.current_pratyantar],
  ] as const) {
    if (current) {
      periods.push(toPeriod(level, current));
    }
  }
  for (const pratyantar of dashas.pratyantar_sequence ?? []) {
    periods.push(toPeriod("pratyantar", pratyantar));
  }

  const yogaNames = new Set<string>();
  const yogaCategories = new Set<string>();
  for (const yoga of chart.yogas) {
    yogaNames.add(normalizeYogaName(yoga.name));
    yogaNames.add(normalizeYogaName(yoga.display_name));
    yogaCategories.add(yoga.category.toLowerCase());
  }

  return { lordships, dignities, periods, yogaNames, yogaCategories };
}
