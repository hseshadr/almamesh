/**
 * A PREVIOUSLY-ASSERTED CONTRACT WAS DELIBERATELY REVERSED HERE.
 *
 * This suite used to pin `canExportPdf`, and its single test asserted the
 * DEFECT as the requirement:
 *
 *   expect(canExportPdf('idle', false)).toBe(false);
 *   expect(canExportPdf('complete', false)).toBe(false);  // "no real content"
 *   expect(canExportPdf('complete', true)).toBe(true);
 *
 * i.e. "the Export PDF button must stay blocked until a finished AI reading
 * exists." That is not a safety property — it is the bug. Every fact the report
 * prints (chart, planets, houses, dasha, yogas, assumptions) is deterministic
 * and already persisted on the device; the written interpretation is one
 * OPTIONAL section. Gating export on it meant a user with no AI key could never
 * export at all, and a user who had one had to pass through a second screen.
 *
 * `canExportPdf` is therefore deleted rather than re-tuned — the concept itself
 * was wrong. The real precondition (a stored chart with birth data) lives in
 * `useReportPdfExport().canExport`, and the behaviour is pinned end-to-end in
 * `__tests__/Dashboard.export.test.tsx`.
 *
 * What survives is `isPlaceholderContent` — unchanged, and still the one place
 * that answers "is this real prose or a 'generating…' stub?". It decides what
 * the Dashboard RENDERS. It must never again decide what the user may EXPORT.
 */
import { describe, expect, it } from 'vitest';

import * as exportGate from './exportGate';
import { isPlaceholderContent } from './exportGate';

describe('exportGate module surface', () => {
  // THE INVERSION, stated as an executable assertion: the old export-blocking
  // predicate must not come back. If someone re-adds `canExportPdf`, this fails.
  it('no longer exposes an interpretation-based export gate', () => {
    expect('canExportPdf' in exportGate).toBe(false);
    expect(Object.keys(exportGate)).toEqual(['isPlaceholderContent']);
  });
});

describe('isPlaceholderContent', () => {
  it('treats missing content as a placeholder', () => {
    expect(isPlaceholderContent(null)).toBe(true);
    expect(isPlaceholderContent(undefined)).toBe(true);
    expect(isPlaceholderContent('')).toBe(true);
  });

  // Was a known gap ('   ' is truthy, and its trimmed value matches no marker),
  // so whitespace-only prose rendered as an empty block. Fixed in this PR.
  it('classifies whitespace-only content as a placeholder', () => {
    expect(isPlaceholderContent('   ')).toBe(true);
    expect(isPlaceholderContent('\n\t ')).toBe(true);
  });

  it('matches every known stub marker exactly', () => {
    for (const marker of [
      'pending',
      'analysis pending',
      'please retry',
      'generating',
      'loading',
      'llm call failed',
    ]) {
      expect(isPlaceholderContent(marker)).toBe(true);
    }
  });

  it('matches stub markers regardless of case and surrounding whitespace', () => {
    expect(isPlaceholderContent('  Generating  ')).toBe(true);
    expect(isPlaceholderContent('PENDING')).toBe(true);
    expect(isPlaceholderContent('LLM Call Failed')).toBe(true);
  });

  it('matches a stub used as a PREFIX of a longer status line', () => {
    expect(isPlaceholderContent('Generating your reading…')).toBe(true);
    expect(isPlaceholderContent('Analysis pending — check back shortly')).toBe(true);
    expect(isPlaceholderContent('Please retry in a moment')).toBe(true);
  });

  it('accepts real prose as real content', () => {
    expect(isPlaceholderContent('You bring quiet persistence to what you commit to.')).toBe(false);
    expect(isPlaceholderContent('Saturn anchors a disciplined identity.')).toBe(false);
  });

  it('does NOT match a stub word buried mid-sentence (prefix rule, not substring)', () => {
    expect(isPlaceholderContent('A decision is pending in your tenth house.')).toBe(false);
    expect(isPlaceholderContent('This is a loading dock, astrologically speaking.')).toBe(false);
  });
});
