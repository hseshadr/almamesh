/**
 * Observations — the deterministic backbone of the evidence-backed report.
 *
 * An observation is a computed factor STATED, with the evidence that produced
 * it, the confidence derived from how it was produced, and a real alternative
 * reading. Every one of those four is computed here, from the engine's chart,
 * with NO model involved. A user with no API key gets the complete
 * Observation / Evidence / Confidence / Alternative table; a model, when
 * present, may only attach an Interpretation to a row that already exists.
 *
 * That inversion is the whole anti-hallucination design. The model cannot
 * invent an observation because it does not author the list — it annotates it.
 */

import { alternateLagna, type AlternateLagna } from './alternateLagna';
import { alternativeFor, type Alternative } from './alternatives';
import { assessConfidence, CUSP_THRESHOLD_DEG, type ConfidenceVerdict } from './confidence';
import { chartFactors, type ChartFactor } from './factors';

import type { SiderealChart } from '@almamesh/browser/types';

export interface Observation {
  /** Stable id — the primary factor. This is what a model annotation cites. */
  readonly id: string;
  /** The primary factor, carrying the numbers the Evidence cell prints. */
  readonly primary: ChartFactor;
  /** Every factor this observation rests on, primary first. */
  readonly supporting: readonly ChartFactor[];
  readonly confidence: ConfidenceVerdict;
  readonly alternative: Alternative;
}

/**
 * Which computed factors get promoted to observations. Deliberately bounded:
 * every non-neutral dignity, every combustion, every retrogradation, every
 * lordship that matters, the running dasha at all three levels, the ascendant,
 * and every yoga the engine formed. Not "everything", which would bury the
 * reader, and not a model's pick, which would be unaccountable.
 */
function observationFactorIds(chart: SiderealChart, factors: readonly ChartFactor[]): string[] {
  const ids: string[] = ['lagna'];
  for (const factor of factors) {
    if (factor.kind === 'dasha' && factor.current) {
      ids.push(factor.id);
    }
    if (factor.kind === 'dignity' && factor.dignity !== 'neutral') {
      ids.push(factor.id);
    }
    if (factor.kind === 'combustion' && factor.combust) {
      ids.push(factor.id);
    }
    if (factor.kind === 'retrograde') {
      ids.push(factor.id);
    }
    if (factor.kind === 'rulership' && factor.yogakaraka) {
      ids.push(factor.id);
    }
    if (factor.kind === 'yoga') {
      ids.push(factor.id);
    }
  }
  void chart;
  return ids;
}

/** The factors an observation cites beyond its primary — its actual support. */
function supportFor(
  primary: ChartFactor,
  byId: ReadonlyMap<string, ChartFactor>,
): ChartFactor[] {
  const support: ChartFactor[] = [primary];
  const add = (id: string): void => {
    const factor = byId.get(id);
    if (factor !== undefined && !support.includes(factor)) {
      support.push(factor);
    }
  };
  switch (primary.kind) {
    case 'dignity':
    case 'combustion':
    case 'retrograde':
      add(`position:${primary.planet}`);
      break;
    case 'rulership':
      add(`house:${primary.planet}`);
      add(`position:${primary.planet}`);
      break;
    case 'yoga':
      // A yoga's strength is a MODEL output; citing it drops the whole claim's
      // ceiling to Low, which is exactly the honest result.
      add(`${primary.id}:strength`);
      for (const planet of primary.planetsInvolved) {
        add(`position:${planet}`);
      }
      break;
    default:
      break;
  }
  return support;
}

export interface ObservationLedger {
  readonly observations: readonly Observation[];
  /** Every citable id in this chart — the validator's allowlist. */
  readonly factorIds: ReadonlySet<string>;
  readonly observationIds: ReadonlySet<string>;
  /** The second chart, when this ascendant has one. */
  readonly alternateLagna: AlternateLagna | null;
}

/** Build the deterministic observation ledger. No model, no network, pure. */
export function buildObservations(chart: SiderealChart): ObservationLedger {
  const factors = chartFactors(chart);
  const byId = new Map(factors.map((factor) => [factor.id, factor]));
  const alternate = alternateLagna(chart, CUSP_THRESHOLD_DEG);

  const observations: Observation[] = [];
  for (const id of observationFactorIds(chart, factors)) {
    const primary = byId.get(id);
    if (primary === undefined) {
      continue;
    }
    const supporting = supportFor(primary, byId);
    observations.push({
      id,
      primary,
      supporting,
      confidence: assessConfidence(supporting, alternate),
      alternative: alternativeFor(primary, alternate),
    });
  }

  return {
    observations,
    factorIds: new Set(byId.keys()),
    observationIds: new Set(observations.map((observation) => observation.id)),
    alternateLagna: alternate,
  };
}
