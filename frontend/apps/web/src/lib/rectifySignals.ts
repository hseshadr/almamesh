/**
 * rectifySignals — the single parser/localizer for the Spec 062 rectification
 * signal-key grammar, shared by the wizard (`EvidenceTable`, `CandidateCard`,
 * `RectifyResults`), the web report Section X and the PDF builder.
 *
 * Grammar (mirrored from `backend/src/almamesh/rectification/scorer.py` and
 * `@almamesh/browser` `pyodide/rectification.ts` — keep in sync):
 *
 *   md_lord_rules_h{n} / md_lord_in_h{n}     maha-dasha lord rules/occupies house n
 *   ad_lord_rules_h{n} / ad_lord_in_h{n}     antar-dasha lord rules/occupies house n
 *   pd_lord_rules_h{n} / pd_lord_in_h{n}     pratyantar lord rules/occupies house n
 *   dasha_lord_rules_h{n} / dasha_lord_in_h{n}  legacy pooled keys (pre-062 snapshots)
 *   slow_transit_h{n}                        Jupiter/Saturn transits house n
 *   d9_lord_rules_d9_h7                      active lord rules 7th-from-D9-lagna
 *   d9_lord_in_d9_h7                         active lord occupies 7th-from-D9-lagna
 *   d9_lord_is_d9_lagna_lord                 active lord rules the D9 lagna
 *   …#afflicted_fit / …#dignified_fit        valence suffix → appended qualifier phrase
 *   prior_anchor                             the weak recorded-time prior (pseudo-signal)
 *   miss_unexplained                         per-event: nothing fired → counts against
 *   miss_silent_{category}_h{n}              candidate-level quiet-period miss
 *
 * ANTI-SCAM: this module renders WORDS only. Scores, contributions and
 * percentages are never formatted here — polarity may use the SIGN of a
 * contribution, never its value.
 */

import type { TFunction } from 'i18next';
import type { EventEvidence, RectificationCandidate } from '@almamesh/shared-types';

/** Whether a signal argues for or against the candidate (or is the prior). */
export type SignalPolarity = 'support' | 'against' | 'prior';

/** Structural signal families used for the "what decided it" storytelling. */
export type SignalFamily = 'pd' | 'ad' | 'md' | 'dasha' | 'd9' | 'transit';

export interface ParsedSignal {
  /** i18n key inside the `rectify` namespace (e.g. "signals.md_lord_rules"). */
  readonly tKey: string;
  readonly polarity: SignalPolarity;
  readonly house?: number;
  /** Raw category token for `miss_silent_{category}_h{n}` keys. */
  readonly category?: string;
  /** i18n key of the valence qualifier phrase, when a `#…_fit` suffix fired. */
  readonly qualifierKey?: string;
  /** Structural family, when the signal belongs to one. */
  readonly family?: SignalFamily;
}

const HOUSE_SIGNAL_RE =
  /^(md_lord_rules|md_lord_in|ad_lord_rules|ad_lord_in|pd_lord_rules|pd_lord_in|dasha_lord_rules|dasha_lord_in|slow_transit)_h(\d{1,2})$/;

const MISS_SILENT_RE = /^miss_silent_([a-z_]+)_h(\d{1,2})$/;

const D9_KEYS: Readonly<Record<string, true>> = {
  d9_lord_rules_d9_h7: true,
  d9_lord_in_d9_h7: true,
  d9_lord_is_d9_lagna_lord: true,
};

const FAMILY_BY_PREFIX: Readonly<Record<string, SignalFamily>> = {
  md_lord_rules: 'md',
  md_lord_in: 'md',
  ad_lord_rules: 'ad',
  ad_lord_in: 'ad',
  pd_lord_rules: 'pd',
  pd_lord_in: 'pd',
  dasha_lord_rules: 'dasha',
  dasha_lord_in: 'dasha',
  slow_transit: 'transit',
};

/** English ordinal suffix: 1→1st, 2→2nd, 3→3rd, 4→4th … */
export function ordinalEn(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Parse one machine signal key into its i18n shape, or null when the key is
 * outside the grammar (callers fall back to the honest "a timing signal").
 */
export function parseSignalKey(key: string): ParsedSignal | null {
  let base = key;
  let qualifierKey: string | undefined;

  const hashIdx = key.indexOf('#');
  if (hashIdx >= 0) {
    const suffix = key.slice(hashIdx + 1);
    base = key.slice(0, hashIdx);
    if (suffix === 'afflicted_fit') qualifierKey = 'signals.qualifier_afflicted';
    else if (suffix === 'dignified_fit') qualifierKey = 'signals.qualifier_dignified';
    else return null; // unknown suffix — treat the whole key as unknown
  }

  if (base === 'miss_unexplained') {
    return { tKey: 'signals.miss_unexplained', polarity: 'against' };
  }
  if (base === 'prior_anchor') {
    return { tKey: 'signals.prior_anchor', polarity: 'prior' };
  }
  if (D9_KEYS[base]) {
    return {
      tKey: `signals.${base}`,
      polarity: 'support',
      family: 'd9',
      ...(qualifierKey !== undefined ? { qualifierKey } : {}),
    };
  }

  const houseMatch = HOUSE_SIGNAL_RE.exec(base);
  if (houseMatch) {
    return {
      tKey: `signals.${houseMatch[1]}`,
      polarity: 'support',
      house: parseInt(houseMatch[2], 10),
      family: FAMILY_BY_PREFIX[houseMatch[1]],
      ...(qualifierKey !== undefined ? { qualifierKey } : {}),
    };
  }

  const missMatch = MISS_SILENT_RE.exec(base);
  if (missMatch) {
    return {
      tKey: 'signals.miss_silent',
      polarity: 'against',
      category: missMatch[1],
      house: parseInt(missMatch[2], 10),
    };
  }

  return null;
}

/**
 * Localize one signal key to a human phrase (valence qualifier appended).
 *
 * `nsPrefix` lets callers whose `t` is bound to another namespace (the report)
 * reach the rectify catalog: pass `'rectify:'` there, `''` inside the wizard.
 */
export function localizeSignal(t: TFunction, key: string, nsPrefix = ''): string {
  const parsed = parseSignalKey(key);
  if (parsed === null) return t(`${nsPrefix}signals.unknown`);

  const options: Record<string, unknown> = {};
  if (parsed.house !== undefined) {
    options.house = parsed.house;
    options.houseOrdinal = ordinalEn(parsed.house);
  }
  if (parsed.category !== undefined) {
    options.category = t(`${nsPrefix}categories.${parsed.category}`);
  }

  const base = t(`${nsPrefix}${parsed.tKey}`, options);
  if (parsed.qualifierKey === undefined) return base;
  return `${base} — ${t(`${nsPrefix}${parsed.qualifierKey}`)}`;
}

/**
 * Per-row polarity: supporting vs counting-against, driven by the signal kinds
 * and the SIGN of the net contribution (its value is never rendered).
 */
export function evidencePolarity(
  signals: readonly string[],
  contribution: number,
): 'support' | 'against' {
  if (contribution < 0) return 'against';
  const parsed = signals.map(parseSignalKey);
  const hasSupport = parsed.some((p) => p !== null && p.polarity === 'support');
  const hasAgainst = parsed.some((p) => p !== null && p.polarity === 'against');
  if (hasAgainst && !hasSupport) return 'against';
  return 'support';
}

/** Honest per-candidate fit counts (counts only — never scores). */
export interface FitCounts {
  /** Positive structural fits across all supporting events. */
  readonly supporting: number;
  /** Events nothing in this candidate's timing explains (`miss_unexplained`). */
  readonly unexplained: number;
  /** Candidate-level quiet-period misses (`misses[]`). */
  readonly quiet: number;
}

export function fitCounts(
  candidate: Pick<RectificationCandidate, 'supportingEvents' | 'misses'>,
): FitCounts {
  let supporting = 0;
  let unexplained = 0;
  for (const event of candidate.supportingEvents) {
    let eventHasMiss = false;
    for (const signal of event.signals) {
      const parsed = parseSignalKey(signal);
      if (parsed !== null && parsed.polarity === 'support') supporting += 1;
      if (parsed !== null && parsed.tKey === 'signals.miss_unexplained') eventHasMiss = true;
    }
    if (eventHasMiss) unexplained += 1;
  }
  return { supporting, unexplained, quiet: candidate.misses.length };
}

/** Fixed storytelling priority when families tie on count (finest depth first). */
const FAMILY_PRIORITY: readonly SignalFamily[] = ['pd', 'ad', 'md', 'dasha', 'd9', 'transit'];

/**
 * The signal families that carried a candidate's positive evidence, strongest
 * first (by signal count, ties broken by depth priority). Powers the "what
 * decided it" line — qualitative kinds only, never scores.
 */
export function decidedFamilies(
  events: readonly EventEvidence[],
  limit = 3,
): readonly SignalFamily[] {
  const counts = new Map<SignalFamily, number>();
  for (const event of events) {
    for (const signal of event.signals) {
      const parsed = parseSignalKey(signal);
      if (parsed !== null && parsed.polarity === 'support' && parsed.family !== undefined) {
        counts.set(parsed.family, (counts.get(parsed.family) ?? 0) + 1);
      }
    }
  }
  return FAMILY_PRIORITY.filter((family) => (counts.get(family) ?? 0) > 0)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, limit);
}
