/**
 * buildRectificationPdf — Section XII slice, phase 2 (Spec 062).
 *
 * v1 records (no resultSnapshot) build the classic facts+events slice only;
 * v2 records add the candidate table, per-event evidence with the SAME
 * depth/polarity labels the wizard shows, quiet-period misses and the prior
 * note. QUALITATIVE ONLY: no %, no margin/fit-score fragments, no raw machine
 * signal keys. All data is SYNTHETIC — never real birth data.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useLanguageStore } from '@almamesh/store';
import type { RectificationRecord } from '@almamesh/shared-types';

import '../../../i18n/config';
import i18next from 'i18next';
import { buildRectificationPdf } from '../buildRectificationPdf';

const t = i18next.getFixedT(null, 'report');

const V1_RECORD: RectificationRecord = {
  profileId: 'profile-1',
  confirmedAt: '2026-05-01T12:00:00.000Z',
  mode: 'cusp',
  band: 'leans',
  margin: 0.7341,
  originalTime: '07:30',
  originalSign: 'aquarius',
  rectifiedTime: '07:45',
  rectifiedSign: 'pisces',
  supportingEventIds: ['evt-1'],
};

const V2_RECORD: RectificationRecord = {
  ...V1_RECORD,
  resultSnapshot: {
    mode: 'cusp',
    band: 'near_tie',
    margin: 0.12,
    discriminatingEventCount: 1,
    recordedTimeSign: 'aquarius',
    honestyNoteKey: 'rectify.honesty.near_tie',
    candidates: [
      {
        ascendantSign: 'pisces',
        representativeTimeLocal: '07:45',
        lagnaLongitudeDeg: 333.8,
        lagnaCuspDistanceDeg: 3.8,
        isNearCusp: false,
        fitScore: 3.4,
        navamsaLagnaSign: 'leo',
        positiveTotal: 3.55,
        penaltyTotal: 0.15,
        priorBonus: 0.35,
        misses: ['miss_silent_career_change_h10'],
        supportingEvents: [
          {
            eventIndex: 0,
            category: 'marriage',
            date: '2015-06-20',
            signals: ['pd_lord_rules_h7#dignified_fit', 'd9_lord_in_d9_h7'],
            contribution: 1.85,
          },
          {
            eventIndex: 1,
            category: 'relocation',
            date: '2019-09-01',
            signals: ['miss_unexplained'],
            contribution: -0.25,
          },
        ],
      },
      {
        ascendantSign: 'aquarius',
        representativeTimeLocal: '07:30',
        lagnaLongitudeDeg: 328.8,
        lagnaCuspDistanceDeg: 1.2,
        isNearCusp: true,
        fitScore: 3.28,
        navamsaLagnaSign: null,
        positiveTotal: 3.28,
        penaltyTotal: 0,
        priorBonus: 0,
        misses: [],
        supportingEvents: [],
      },
    ],
  },
};

const EVENTS = [{ date: '2015-06-20', category: 'marriage', summary: 'A wedding' }];

/** Every string the slice will print, flattened for the anti-scam sweep. */
function allText(slice: ReturnType<typeof buildRectificationPdf>): string {
  return JSON.stringify(slice);
}

describe('buildRectificationPdf — v1 fallback', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('omits every phase-2 slice for a record without resultSnapshot', () => {
    const slice = buildRectificationPdf({ record: V1_RECORD, events: EVENTS, t });
    expect(slice.candidates).toBeUndefined();
    expect(slice.evidence).toBeUndefined();
    expect(slice.missNotes).toBeUndefined();
    expect(slice.priorNote).toBeUndefined();
    expect(slice.facts.length).toBeGreaterThan(0);
  });
});

describe('buildRectificationPdf — method label honesty', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('window-mode method copy never claims a full-day scan (bounded ±windows use the same mode)', () => {
    // spanMinutes does NOT survive into the record, so the ONE window label
    // must be honest for both a ±1h window and a whole-day scan.
    const slice = buildRectificationPdf({
      record: { ...V1_RECORD, mode: 'window' },
      events: EVENTS,
      t,
    });
    const method = slice.facts.find((f) => f.label === t('rectification.mode_label'));
    expect(method?.value).toMatch(/window/i);
    expect(method?.value).not.toMatch(/full[- ]day|whole[- ]day/i);
  });
});

describe('buildRectificationPdf — phase 2 snapshot', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('builds the candidate table: sign, time, navamsa rising, qualitative reading', () => {
    const slice = buildRectificationPdf({ record: V2_RECORD, events: EVENTS, t });
    expect(slice.candidatesHeading).toBeTruthy();
    const rows = slice.candidates?.rows ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0].cells.join(' ')).toContain('Pisces');
    expect(rows[0].cells.join(' ')).toContain('07:45');
    expect(rows[0].cells.join(' ')).toContain('Leo');
    expect(rows[0].cells.join(' ')).toContain('Confirmed choice');
    // near_tie band → the runner-up is labeled a near-tie alternative
    expect(rows[1].cells.join(' ')).toContain('Near-tie alternative');
  });

  it('builds per-event evidence with depth/polarity labels and date-safe dates', () => {
    const slice = buildRectificationPdf({ record: V2_RECORD, events: EVENTS, t });
    const rows = slice.evidence?.rows ?? [];
    expect(rows).toHaveLength(2);
    const first = rows[0].cells.join(' ');
    expect(first).toMatch(/pratyantar/i);
    expect(first).toMatch(/dignified/i);
    expect(first).toMatch(/navamsa/i);
    expect(first).toContain('Supports');
    expect(first).toContain('06/20/2015'); // written calendar date, never rolled back
    const second = rows[1].cells.join(' ');
    expect(second).toContain('Counts against');
  });

  it('lists misses qualitatively and adds the prior note when priorBonus > 0', () => {
    const slice = buildRectificationPdf({ record: V2_RECORD, events: EVENTS, t });
    expect(slice.missNotes?.[0]).toMatch(/predicted a strong career change window/i);
    expect(slice.priorNote).toMatch(/closest to the recorded time/i);
  });

  it('QUALITATIVE ONLY: no %, no raw keys, no score fragments anywhere in the slice', () => {
    const text = allText(buildRectificationPdf({ record: V2_RECORD, events: EVENTS, t }));
    expect(text).not.toContain('%');
    expect(text).not.toContain('pd_lord_rules_h7');
    expect(text).not.toContain('miss_silent');
    expect(text).not.toContain('miss_unexplained');
    expect(text).not.toContain('#dignified_fit');
    expect(text).not.toContain('3.55');
    expect(text).not.toContain('0.7341');
    expect(text).not.toContain('1.85');
  });
});
