/**
 * lib/mesh — pure display helpers behind the Mesh surfaces.
 *
 * Everything here is geometry, date arithmetic, data-presence checks and
 * verbatim field selection. NO astrology is computed in TypeScript — the
 * engine's numbers pass through untouched (display rounding only).
 */
import { describe, expect, it } from 'vitest';
import type { StoredChart } from '@almamesh/store';
import type { AshtakootaData, MeshMoonData, OverlayContactData } from '@almamesh/shared-types';

import {
  addYearsIso,
  formatOrbDegrees,
  hasBirthChart,
  isMarriageEdge,
  kootaOf,
  lagnaSignOf,
  meshEdgeWindow,
  moonsByRole,
  prettyNakshatra,
  profileChartOf,
  radialNodeLayout,
  strongestContacts,
} from './mesh';

// ---------------------------------------------------------------------------
// radialNodeLayout — the constellation circle (percent coordinates)
// ---------------------------------------------------------------------------

describe('radialNodeLayout', () => {
  it('places a single member at the top of the orbit', () => {
    expect(radialNodeLayout(1)).toEqual([{ xPct: 50, yPct: 12 }]);
  });

  it('distributes four members clockwise from the top', () => {
    expect(radialNodeLayout(4)).toEqual([
      { xPct: 50, yPct: 12 },
      { xPct: 88, yPct: 50 },
      { xPct: 50, yPct: 88 },
      { xPct: 12, yPct: 50 },
    ]);
  });

  it('keeps every node inside the canvas for a crowded mesh', () => {
    for (const { xPct, yPct } of radialNodeLayout(12)) {
      expect(xPct).toBeGreaterThanOrEqual(4);
      expect(xPct).toBeLessThanOrEqual(96);
      expect(yPct).toBeGreaterThanOrEqual(4);
      expect(yPct).toBeLessThanOrEqual(96);
    }
  });

  it('returns no positions for an empty mesh', () => {
    expect(radialNodeLayout(0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addYearsIso + meshEdgeWindow — explicit instants, no silent wall clock
// ---------------------------------------------------------------------------

describe('addYearsIso', () => {
  it('adds whole UTC years to a pinned instant', () => {
    expect(addYearsIso('2026-06-11T00:00:00Z', 2)).toBe('2028-06-11T00:00:00Z');
  });

  it('rolls a leap day forward like the Date UTC calendar does', () => {
    expect(addYearsIso('2024-02-29T00:00:00Z', 1)).toBe('2025-03-01T00:00:00Z');
  });
});

describe('meshEdgeWindow', () => {
  const REF = '2026-06-11T00:00:00Z';

  it('builds a now → +N years window pinned to the reference instant', () => {
    const window = meshEdgeWindow(REF, 2, 'anchor');
    expect(window.start).toBe(REF);
    expect(window.end).toBe('2028-06-11T00:00:00Z');
    expect(window.referenceInstant).toBe(REF);
  });

  it('seats the bride-table on the anchor by default convention', () => {
    const window = meshEdgeWindow(REF, 1, 'anchor');
    expect(window.anchorRole).toBe('bride');
    expect(window.memberRole).toBe('groom');
  });

  it('flips both seats when the bride-table reads for the member', () => {
    const window = meshEdgeWindow(REF, 5, 'member');
    expect(window.anchorRole).toBe('groom');
    expect(window.memberRole).toBe('bride');
  });
});

// ---------------------------------------------------------------------------
// Relationship curation — marriage tables are spouse/partner only
// ---------------------------------------------------------------------------

describe('isMarriageEdge', () => {
  it('is true only for spouse and partner edges', () => {
    expect(isMarriageEdge('spouse')).toBe(true);
    expect(isMarriageEdge('partner')).toBe(true);
    expect(isMarriageEdge('mother')).toBe(false);
    expect(isMarriageEdge('friend')).toBe(false);
    expect(isMarriageEdge('business')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Chart-library reads — presence + verbatim lagna selection
// ---------------------------------------------------------------------------

function chartFor(profileId: string, overrides: Record<string, unknown> = {}): StoredChart {
  return {
    chart_id: `chart-${profileId}`,
    person_name: 'Someone',
    is_primary: true,
    profile_id: profileId,
    birth_data: {
      birth_datetime_utc: '1990-01-15T12:00:00+00:00',
      birth_datetime_local: '1990-01-15T17:30:00',
      birth_location_details: {
        city: 'Delhi',
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 'Asia/Kolkata',
      },
    },
    astronomical_calculations: {
      sidereal_ctx: { lagna: { sign: 'Aquarius', longitude: 328.84 } },
    },
    ...overrides,
  } as unknown as StoredChart;
}

describe('profileChartOf / hasBirthChart', () => {
  it('prefers the primary chart among a profile’s charts', () => {
    const secondary = chartFor('p1', { chart_id: 'c-old', is_primary: false });
    const primary = chartFor('p1', { chart_id: 'c-new' });
    const charts = { 'c-old': secondary, 'c-new': primary };
    expect(profileChartOf(charts, 'p1')?.chart_id).toBe('c-new');
    expect(hasBirthChart(charts, 'p1')).toBe(true);
  });

  it('reports no chart for a profile that never generated one', () => {
    const charts = { 'c-1': chartFor('p1') };
    expect(profileChartOf(charts, 'p2')).toBeUndefined();
    expect(hasBirthChart(charts, 'p2')).toBe(false);
  });

  it('treats a chart without birth location as not usable for an edge', () => {
    const broken = chartFor('p1', {
      birth_data: { birth_datetime_utc: '1990-01-15T12:00:00+00:00' },
    });
    expect(hasBirthChart({ c: broken }, 'p1')).toBe(false);
  });
});

describe('lagnaSignOf', () => {
  it('reads the engine-emitted rising sign as a lowercase token', () => {
    expect(lagnaSignOf(chartFor('p1'))).toBe('aquarius');
  });

  it('is undefined when the stored chart carries no lagna', () => {
    const bare = chartFor('p1', { astronomical_calculations: { sidereal_ctx: { lagna: {} } } });
    expect(lagnaSignOf(bare)).toBeUndefined();
    expect(lagnaSignOf(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Verbatim selection over engine data — never re-scored, only ordered
// ---------------------------------------------------------------------------

function contact(overrides: Partial<OverlayContactData>): OverlayContactData {
  return {
    planet: 'venus',
    target: 'moon',
    kind: 'same_sign',
    host_house: 5,
    orb_degrees: null,
    heuristic: false,
    source: 'test',
    ...overrides,
  };
}

describe('strongestContacts', () => {
  it('orders close conjunctions (tightest orb first), then dṛṣṭi, then sign shares', () => {
    const contacts = [
      contact({ kind: 'same_sign', planet: 'sun' }),
      contact({ kind: 'close_conjunction', planet: 'venus', orb_degrees: 4.2 }),
      contact({ kind: 'graha_drishti', planet: 'saturn' }),
      contact({ kind: 'close_conjunction', planet: 'moon', orb_degrees: 1.1 }),
    ];
    expect(strongestContacts(contacts).map((c) => c.planet)).toEqual([
      'moon',
      'venus',
      'saturn',
      'sun',
    ]);
  });

  it('caps the list without mutating the input', () => {
    const contacts = Array.from({ length: 9 }, (_, i) =>
      contact({ host_house: i + 1, kind: 'same_sign' }),
    );
    expect(strongestContacts(contacts, 3)).toHaveLength(3);
    expect(contacts).toHaveLength(9);
  });
});

const MOON_A: MeshMoonData = {
  nakshatra: 'Rohini',
  nakshatra_index: 3,
  nakshatra_pada: 2,
  sign: 'taurus',
  sign_degrees: 12.5,
};
const MOON_B: MeshMoonData = {
  nakshatra: 'Magha',
  nakshatra_index: 9,
  nakshatra_pada: 1,
  sign: 'leo',
  sign_degrees: 3.1,
};

const ASHTAKOOTA = {
  bride_moon: MOON_A,
  groom_moon: MOON_B,
  kootas: [
    { koota: 'varna', earned: 1, maximum: 1, basis: 'b', source: 's' },
    { koota: 'graha_maitri', earned: 4, maximum: 5, basis: 'lords are friends', source: 's' },
  ],
} as unknown as AshtakootaData;

describe('kootaOf / moonsByRole', () => {
  it('selects one koota row verbatim', () => {
    expect(kootaOf(ASHTAKOOTA, 'graha_maitri')?.earned).toBe(4);
    expect(kootaOf(ASHTAKOOTA, 'nadi')).toBeUndefined();
  });

  it('maps bride/groom Moons back to anchor/member through the explicit roles', () => {
    expect(moonsByRole('bride', ASHTAKOOTA)).toEqual({ anchorMoon: MOON_A, memberMoon: MOON_B });
    expect(moonsByRole('groom', ASHTAKOOTA)).toEqual({ anchorMoon: MOON_B, memberMoon: MOON_A });
  });
});

describe('formatOrbDegrees', () => {
  it('rounds the engine orb to one display decimal', () => {
    expect(formatOrbDegrees(2.1349)).toBe('2.1');
    expect(formatOrbDegrees(0)).toBe('0.0');
  });
});

describe('prettyNakshatra', () => {
  it('replaces underscores with spaces, leaving the proper noun untranslated', () => {
    expect(prettyNakshatra('Purva_Bhadrapada')).toBe('Purva Bhadrapada');
    expect(prettyNakshatra('Rohini')).toBe('Rohini');
  });
});
