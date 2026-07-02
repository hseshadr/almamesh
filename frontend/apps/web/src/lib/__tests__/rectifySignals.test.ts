/**
 * rectifySignals — the full Spec 062 signal-key grammar, parsed and localized.
 *
 * Every grammar production gets a case, plus the unknown-key fallback (the
 * anti-scam gate: raw machine keys must NEVER surface). All fixtures are
 * synthetic — no real birth data.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useLanguageStore } from '@almamesh/store';
import type { EventEvidence } from '@almamesh/shared-types';

import '../../i18n/config';
import i18next from 'i18next';
import {
  decidedFamilies,
  evidencePolarity,
  fitCounts,
  localizeSignal,
  ordinalEn,
  parseSignalKey,
} from '../rectifySignals';

const t = i18next.getFixedT(null, 'rectify');

beforeEach(() => {
  useLanguageStore.setState({ language: 'en' });
});

describe('parseSignalKey — grammar coverage', () => {
  it.each([
    ['md_lord_rules_h10', 'signals.md_lord_rules', 10, 'md'],
    ['md_lord_in_h4', 'signals.md_lord_in', 4, 'md'],
    ['ad_lord_rules_h7', 'signals.ad_lord_rules', 7, 'ad'],
    ['ad_lord_in_h2', 'signals.ad_lord_in', 2, 'ad'],
    ['pd_lord_rules_h11', 'signals.pd_lord_rules', 11, 'pd'],
    ['pd_lord_in_h1', 'signals.pd_lord_in', 1, 'pd'],
    ['dasha_lord_rules_h7', 'signals.dasha_lord_rules', 7, 'dasha'],
    ['dasha_lord_in_h10', 'signals.dasha_lord_in', 10, 'dasha'],
    ['slow_transit_h12', 'signals.slow_transit', 12, 'transit'],
  ] as const)('parses depth/house key %s', (key, tKey, house, family) => {
    const parsed = parseSignalKey(key);
    expect(parsed).not.toBeNull();
    expect(parsed?.tKey).toBe(tKey);
    expect(parsed?.house).toBe(house);
    expect(parsed?.family).toBe(family);
    expect(parsed?.polarity).toBe('support');
  });

  it.each([
    'd9_lord_rules_d9_h7',
    'd9_lord_in_d9_h7',
    'd9_lord_is_d9_lagna_lord',
  ] as const)('parses D9 key %s (no house, family d9)', (key) => {
    const parsed = parseSignalKey(key);
    expect(parsed?.tKey).toBe(`signals.${key}`);
    expect(parsed?.house).toBeUndefined();
    expect(parsed?.family).toBe('d9');
    expect(parsed?.polarity).toBe('support');
  });

  it('parses the afflicted-fit valence suffix into a qualifier key', () => {
    const parsed = parseSignalKey('ad_lord_rules_h8#afflicted_fit');
    expect(parsed?.tKey).toBe('signals.ad_lord_rules');
    expect(parsed?.house).toBe(8);
    expect(parsed?.qualifierKey).toBe('signals.qualifier_afflicted');
  });

  it('parses the dignified-fit valence suffix (incl. on D9 keys)', () => {
    expect(parseSignalKey('md_lord_in_h9#dignified_fit')?.qualifierKey).toBe(
      'signals.qualifier_dignified',
    );
    expect(parseSignalKey('d9_lord_rules_d9_h7#dignified_fit')?.qualifierKey).toBe(
      'signals.qualifier_dignified',
    );
  });

  it('parses miss_unexplained as counting-against', () => {
    const parsed = parseSignalKey('miss_unexplained');
    expect(parsed?.tKey).toBe('signals.miss_unexplained');
    expect(parsed?.polarity).toBe('against');
  });

  it('parses miss_silent_{category}_h{n} incl. multi-word categories', () => {
    const parsed = parseSignalKey('miss_silent_career_change_h10');
    expect(parsed?.tKey).toBe('signals.miss_silent');
    expect(parsed?.category).toBe('career_change');
    expect(parsed?.house).toBe(10);
    expect(parsed?.polarity).toBe('against');
  });

  it('parses prior_anchor as the prior pseudo-signal', () => {
    expect(parseSignalKey('prior_anchor')?.polarity).toBe('prior');
  });

  it.each(['garbage', 'weird_signal_h99x', 'md_lord_rules_h', 'ad_lord_rules_h7#nonsense', ''])(
    'returns null for unknown key %j',
    (key) => {
      expect(parseSignalKey(key)).toBeNull();
    },
  );
});

describe('localizeSignal — human phrases, never raw keys', () => {
  it('localizes depth keys with the house ordinal', () => {
    expect(localizeSignal(t, 'pd_lord_rules_h7')).toMatch(/pratyantar/i);
    expect(localizeSignal(t, 'pd_lord_rules_h7')).toContain('7th');
    expect(localizeSignal(t, 'md_lord_rules_h10')).toMatch(/maha/i);
    expect(localizeSignal(t, 'ad_lord_in_h2')).toMatch(/antar/i);
  });

  it('appends the valence qualifier phrase after an em dash', () => {
    const phrase = localizeSignal(t, 'ad_lord_rules_h8#afflicted_fit');
    expect(phrase).toContain(' — ');
    expect(phrase).toMatch(/afflicted/i);
    const dignified = localizeSignal(t, 'md_lord_in_h9#dignified_fit');
    expect(dignified).toMatch(/dignified/i);
  });

  it('localizes D9 keys with a navamsa gloss', () => {
    expect(localizeSignal(t, 'd9_lord_rules_d9_h7')).toMatch(/navamsa|D9/i);
    expect(localizeSignal(t, 'd9_lord_is_d9_lagna_lord')).toMatch(/rising/i);
  });

  it('localizes miss_silent with the localized category name', () => {
    const phrase = localizeSignal(t, 'miss_silent_marriage_h7');
    expect(phrase).toMatch(/marriage/i);
    expect(phrase).toMatch(/nothing reported/i);
    expect(phrase).not.toContain('miss_silent');
  });

  it('localizes miss_unexplained as counting against', () => {
    expect(localizeSignal(t, 'miss_unexplained')).toMatch(/counts against/i);
  });

  it('falls back to the honest generic phrase for unknown keys', () => {
    expect(localizeSignal(t, 'weird_signal_h99x')).toMatch(/a timing signal/i);
    expect(localizeSignal(t, 'garbage')).not.toContain('garbage');
  });

  it('never emits a % character for any grammar key', () => {
    const keys = [
      'md_lord_rules_h1',
      'pd_lord_in_h12#dignified_fit',
      'd9_lord_in_d9_h7',
      'miss_silent_job_loss_h6',
      'miss_unexplained',
      'prior_anchor',
      'unknown_thing',
    ];
    for (const key of keys) {
      expect(localizeSignal(t, key)).not.toContain('%');
    }
  });
});

describe('evidencePolarity — sign of contribution + signal kinds only', () => {
  it('negative contribution → against', () => {
    expect(evidencePolarity(['md_lord_rules_h7'], -0.25)).toBe('against');
  });

  it('miss-only signals → against even at zero contribution', () => {
    expect(evidencePolarity(['miss_unexplained'], 0)).toBe('against');
  });

  it('positive fits → support', () => {
    expect(evidencePolarity(['ad_lord_rules_h7', 'slow_transit_h7'], 1.7)).toBe('support');
  });
});

describe('fitCounts — counts only, never scores', () => {
  const events: readonly EventEvidence[] = [
    {
      eventIndex: 0,
      category: 'marriage',
      date: '2011-06-01',
      signals: ['ad_lord_rules_h7', 'd9_lord_rules_d9_h7', 'slow_transit_h7'],
      contribution: 2.05,
    },
    {
      eventIndex: 1,
      category: 'career_change',
      date: '2016-02-01',
      signals: ['pd_lord_in_h10'],
      contribution: 0.5,
    },
    {
      eventIndex: 2,
      category: 'relocation',
      date: '2019-09-01',
      signals: ['miss_unexplained'],
      contribution: -0.25,
    },
  ];

  it('counts supporting fits, unexplained events and quiet-period misses', () => {
    const counts = fitCounts({
      supportingEvents: events,
      misses: ['miss_silent_marriage_h7'],
    });
    expect(counts).toEqual({ supporting: 4, unexplained: 1, quiet: 1 });
  });

  it('decidedFamilies ranks the contributing families, finest depth first on ties', () => {
    expect(decidedFamilies(events)).toEqual(['pd', 'ad', 'd9']);
  });
});

describe('ordinalEn', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
  ] as const)('%d → %s', (n, expected) => {
    expect(ordinalEn(n)).toBe(expected);
  });
});
