/**
 * RectifyResults — honest results UI (bands, evidence, no false precision).
 *
 * Anti-scam invariants enforced at the render boundary:
 *  - NEVER a headline percentage anywhere in the output
 *  - near_tie: BOTH top candidates shown + explicit "only recorded time settles this" copy
 *  - signal machine keys translated to localized phrases before display
 *  - representative time is clearly labelled as such (not an exact claim)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';
import type { RectificationResult, RectificationCandidate } from '@almamesh/shared-types';

import '../../../i18n/config';
import type { CandidateReading } from '../settings/BirthTimeComparison';
import { RectifyResults } from './RectifyResults';

// ---------------------------------------------------------------------------
// Fixtures — synthetic birth data only; no real PII
// ---------------------------------------------------------------------------

const CANDIDATE_A: RectificationCandidate = {
  ascendantSign: 'Pisces',
  representativeTimeLocal: '07:45',
  lagnaLongitudeDeg: 333.8,
  lagnaCuspDistanceDeg: 3.8,
  isNearCusp: false,
  fitScore: 12.5,
  supportingEvents: [
    {
      eventIndex: 0,
      category: 'marriage',
      date: '1998-12-05',
      signals: ['dasha_lord_rules_h7', 'slow_transit_h7'],
      contribution: 5.0,
    },
    {
      eventIndex: 1,
      category: 'career_change',
      date: '2005-03-15',
      signals: ['dasha_lord_in_h10'],
      contribution: 4.5,
    },
  ],
};

const CANDIDATE_B: RectificationCandidate = {
  ascendantSign: 'Aquarius',
  representativeTimeLocal: '07:30',
  lagnaLongitudeDeg: 328.82,
  lagnaCuspDistanceDeg: 1.18,
  isNearCusp: true,
  fitScore: 4.0,
  supportingEvents: [],
};

const CONSISTENT_RESULT: RectificationResult = {
  mode: 'cusp',
  band: 'consistent',
  margin: 8.5,
  discriminatingEventCount: 3,
  recordedTimeSign: 'Aquarius',
  honestyNoteKey: 'rectify.honesty.consistent',
  candidates: [CANDIDATE_A, CANDIDATE_B],
};

const NEAR_TIE_RESULT: RectificationResult = {
  mode: 'cusp',
  band: 'near_tie',
  margin: 0.5,
  discriminatingEventCount: 1,
  recordedTimeSign: 'Aquarius',
  honestyNoteKey: 'rectify.honesty.near_tie',
  candidates: [CANDIDATE_A, CANDIDATE_B],
};

const RECORDED_READING: CandidateReading = {
  time: '07:30',
  sign: 'Aquarius',
  signDegrees: 28.82,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RectifyResults — consistent band', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders the band label', () => {
    render(
      <RectifyResults
        result={CONSISTENT_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(screen.getByTestId('band-label').textContent).toBeTruthy();
  });

  it('renders the honesty note with meaningful content', () => {
    render(
      <RectifyResults
        result={CONSISTENT_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(screen.getByTestId('honesty-note').textContent).toMatch(
      /recorded|starting point|certainty/i,
    );
  });

  it('renders evidence rows with localized signal phrases — not raw machine keys', () => {
    const { container } = render(
      <RectifyResults
        result={CONSISTENT_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    // Raw signal machine keys must NOT appear in the output
    expect(container.textContent).not.toContain('dasha_lord_rules_h7');
    expect(container.textContent).not.toContain('slow_transit_h7');
    expect(container.textContent).not.toContain('dasha_lord_in_h10');
    // Localized forms: signal phrases should appear (not coincidental digit matches)
    expect(container.textContent).toMatch(/dasha lord|slow planet/i);
  });

  it('gracefully degrades garbled signal keys — no crash, no raw key dump', () => {
    const resultWithGarbledSignals: RectificationResult = {
      ...CONSISTENT_RESULT,
      candidates: [
        {
          ...CANDIDATE_A,
          supportingEvents: [
            {
              eventIndex: 0,
              category: 'marriage',
              date: '1998-12-05',
              signals: ['weird_signal_h99', 'garbage'],
              contribution: 5.0,
            },
          ],
        },
        CANDIDATE_B,
      ],
    };
    const { container } = render(
      <RectifyResults
        result={resultWithGarbledSignals}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    // Must not crash, must not leak raw machine keys (no underscores from signal names)
    expect(container.textContent).not.toContain('weird_signal_h99');
    expect(container.textContent).not.toContain('garbage');
    // Must show a human-readable fallback phrase
    expect(container.textContent).toMatch(/a timing signal/i);
  });

  it('renders the recorded-time reference section', () => {
    render(
      <RectifyResults
        result={CONSISTENT_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(screen.getByTestId('recorded-reference')).toBeTruthy();
  });

  it('contains NO "%" character anywhere in the rendered output', () => {
    const { container } = render(
      <RectifyResults
        result={CONSISTENT_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain('%');
  });

  it('confirm button calls onConfirm with the top candidate', () => {
    const onConfirm = vi.fn();
    render(
      <RectifyResults
        result={CONSISTENT_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={onConfirm}
        onKeepRecorded={vi.fn()}
      />,
    );
    // First confirm button = top candidate (index 0)
    const confirmButtons = screen.getAllByTestId('confirm-button');
    fireEvent.click(confirmButtons[0]);
    expect(onConfirm).toHaveBeenCalledWith(CANDIDATE_A);
  });

  it('keep-recorded button calls onKeepRecorded', () => {
    const onKeepRecorded = vi.fn();
    render(
      <RectifyResults
        result={CONSISTENT_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={onKeepRecorded}
      />,
    );
    fireEvent.click(screen.getByTestId('keep-recorded-button'));
    expect(onKeepRecorded).toHaveBeenCalled();
  });
});

describe('RectifyResults — near_tie band', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders BOTH top candidate cards', () => {
    render(
      <RectifyResults
        result={NEAR_TIE_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    const cards = screen.getAllByTestId('candidate-card');
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the "only recorded time settles this" copy with meaningful content', () => {
    render(
      <RectifyResults
        result={NEAR_TIE_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(screen.getByTestId('near-tie-settle-note').textContent).toMatch(
      /recorded|settle|certificate/i,
    );
  });

  it('contains NO "%" character anywhere in the near_tie output', () => {
    const { container } = render(
      <RectifyResults
        result={NEAR_TIE_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain('%');
  });
});

// ---------------------------------------------------------------------------
// Window mode caveat (sign-level, not minute-level)
// ---------------------------------------------------------------------------

const WINDOW_RESULT: RectificationResult = {
  mode: 'window',
  band: 'leans',
  margin: 0.25,
  discriminatingEventCount: 2,
  recordedTimeSign: null,
  honestyNoteKey: 'rectify.honesty.leans',
  candidates: [CANDIDATE_A, CANDIDATE_B],
};

describe('RectifyResults — window mode caveat', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders the sign-level caveat when mode is "window"', () => {
    render(
      <RectifyResults
        result={WINDOW_RESULT}
        recordedReading={null}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(screen.getByTestId('window-sign-caveat')).toBeTruthy();
  });

  it('window caveat text explains sign-level resolution (not minute-level)', () => {
    render(
      <RectifyResults
        result={WINDOW_RESULT}
        recordedReading={null}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    const caveat = screen.getByTestId('window-sign-caveat');
    expect(caveat.textContent).toMatch(/sign|minute|illustrative/i);
  });

  it('does NOT render the window caveat for cusp mode', () => {
    render(
      <RectifyResults
        result={CONSISTENT_RESULT}
        recordedReading={RECORDED_READING}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('window-sign-caveat')).toBeNull();
  });

  it('contains NO "%" in the window mode output', () => {
    const { container } = render(
      <RectifyResults
        result={WINDOW_RESULT}
        recordedReading={null}
        onConfirm={vi.fn()}
        onKeepRecorded={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain('%');
  });
});
