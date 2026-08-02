/**
 * factsAreText — the rendering invariant: a fact the ENGINE computed must reach
 * the reader as TEXT, never as styling alone.
 *
 * WHY THIS EXISTS. The exported PDF used to encode two real engine facts purely
 * as visual attributes. Combustion was `opacity: 0.55` on the row — so Venus,
 * which the engine had measured at 2.76° from the Sun against a 10° orb, printed
 * `EXALTED` and nothing else; the word "combust" appeared seven times in a
 * 28-page document and zero times in the planetary table, the one place a reader
 * looks up Venus. The running mahā-daśā was a brass dot (a `<View>` contributes
 * no characters) plus a slightly heavier font — so all nine mahā rows extracted
 * identically. A fact carried only by colour or opacity survives neither text
 * extraction, nor a screen reader, nor greyscale printing, nor a photocopy.
 *
 * WHAT THIS TEST DOES. It renders REAL PDF bytes and reads them back with
 * poppler's `pdftotext`, then asserts the facts appear in the extracted text —
 * driven by the engine chart and the built data, never by a hardcoded list of
 * strings. Add a future fact that is styled-but-not-stated and this fails.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not check colour, weight, or the
 * brass dot. Those stay as REDUNDANT cues; the point is that they must never be
 * the only carrier. Nor does it look for the fact "somewhere in the document":
 * every combustion assertion is pinned to the planet's own table ROW (the line
 * must also carry that planet's sign), because the original defect passed a
 * document-wide search — the yoga ledgers were stating combustion while the
 * table stayed silent.
 */

import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ReportDocument } from '../ReportDocument';
import { registerReportFonts } from '../theme';
import type { ReportPdfData } from '../types';
import { combustionOrbDeg } from '../../../lib/evidence/combustionOrbs';
import { CHART, buildMaximalReportPdfData, maximalReportT } from './maximalReportFixture';
import { inspectPdfWithPoppler, linesContainingAll, type InspectedPdf } from './pdfPoppler';

vi.hoisted(() => {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return entries.size;
      },
      clear: () => entries.clear(),
      getItem: (key: string) => entries.get(key) ?? null,
      key: (index: number) => [...entries.keys()][index] ?? null,
      removeItem: (key: string) => entries.delete(key),
      setItem: (key: string, value: string) => entries.set(key, value),
    },
  });
});

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** Degrees are stated to 2 dp everywhere in the report. */
function degrees2dp(value: number): string {
  return value.toFixed(2);
}

/** Whole orbs print bare ("10"), fractional ones to 2 dp — same as the report. */
function orbFigure(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function containsCaseless(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase('en').includes(needle.toLocaleLowerCase('en'));
}

describe('every engine fact reaches the reader as text', () => {
  let data: ReportPdfData;
  let pdf: InspectedPdf;
  /** The very words the document was localized from — never a copy of them. */
  let combustWord: string;

  beforeAll(async () => {
    registerReportFonts(path.resolve('public/fonts'));
    const t = maximalReportT();
    combustWord = String(t('planets.combust'));
    data = buildMaximalReportPdfData();
    let bytes: Uint8Array | undefined;
    await act(async () => {
      bytes = await renderToBuffer(<ReportDocument data={data} />);
    });
    if (!bytes) throw new Error('The maximal report did not render bytes');
    pdf = await inspectPdfWithPoppler(bytes);
  }, 60_000);

  it('states combustion in the combust planet’s own table row, with its measured separation', () => {
    const combust = Object.values(CHART.planets).filter((planet) => planet.is_combust);
    expect(
      combust.length,
      'The maximal fixture must contain at least one combust graha, or this guard proves nothing.',
    ).toBeGreaterThan(0);

    for (const planet of combust) {
      const name = titleCase(planet.name);
      // The sign pins the match to the PLANETARY TABLE row: the yoga strength
      // ledgers also print "<planet> combust", and the original defect passed a
      // document-wide search precisely because of that.
      const rowNeedles = [name, planet.sign, combustWord];
      const rows = linesContainingAll(pdf, rowNeedles);
      expect(
        rows.length,
        `The planetary table never states that ${name} is combust. The engine set ` +
          `is_combust=true for it, so the row must SAY so — dimming the row is a ` +
          `redundant cue, not a carrier. Looked for a line containing ` +
          `${JSON.stringify(rowNeedles)}.`,
      ).toBeGreaterThan(0);

      const separation = planet.combustion_separation_deg;
      if (separation === null || separation === undefined) continue;
      const figure = degrees2dp(separation);
      expect(
        rows.some((line) => line.includes(figure)),
        `${name}'s row says "combust" but never states the measured separation ` +
          `${figure}° the engine computed. A reader cannot check an unstated number. ` +
          `Rows found: ${JSON.stringify(rows)}.`,
      ).toBe(true);

      const orb = combustionOrbDeg(planet.name, planet.is_retrograde);
      if (orb === null) continue;
      const stated = linesContainingAll(pdf, [name, figure, orbFigure(orb)]);
      expect(
        stated.length,
        `${name} is stated combust at ${figure}°, but the orb it was tested ` +
          `against (${orbFigure(orb)}°) appears nowhere beside it. Without the orb ` +
          `the separation is not checkable arithmetic, just a number.`,
      ).toBeGreaterThan(0);
    }
  });

  it('never marks a planet the engine did not call combust', () => {
    const calm = Object.values(CHART.planets).filter((planet) => !planet.is_combust);
    for (const planet of calm) {
      const name = titleCase(planet.name);
      const rows = linesContainingAll(pdf, [name, planet.sign, combustWord]);
      expect(
        rows,
        `${name} is NOT combust in the engine chart, but its planetary-table row ` +
          `says it is: ${JSON.stringify(rows)}.`,
      ).toEqual([]);
    }
  });

  it('distinguishes the running mahā-daśā row from the other eight, in text', () => {
    const marker = data.labels.dashaCurrentMarker;
    expect(
      marker,
      'The PDF carries no textual marker for the running mahā-daśā. A brass dot is ' +
        'a `<View>` — it contributes zero characters, so all nine rows extract alike.',
    ).toBeTruthy();

    const running = data.dasha.mahaSequence.filter((period) => period.isCurrent);
    expect(running, 'Exactly one mahā-daśā must be the running one.').toHaveLength(1);

    for (const period of data.dasha.mahaSequence) {
      const needles = [period.lord, period.start, period.end, period.span].filter(Boolean);
      const rows = linesContainingAll(pdf, needles);
      expect(
        rows.length,
        `The mahā-daśā sequence never printed a row for ${period.lord} ` +
          `(${period.start} — ${period.end}).`,
      ).toBeGreaterThan(0);

      const marked = rows.filter((line) => containsCaseless(line, String(marker)));
      if (period.isCurrent) {
        expect(
          marked.length,
          `The running ${period.lord} mahā-daśā row reads exactly like the other ` +
            `eight. Its row must SAY it is the current period, not merely wear ` +
            `brass. Rows found: ${JSON.stringify(rows)}.`,
        ).toBeGreaterThan(0);
      } else {
        expect(
          marked,
          `The ${period.lord} mahā-daśā is not running, yet its row carries the ` +
            `"${String(marker)}" marker.`,
        ).toEqual([]);
      }
    }
  });
});
