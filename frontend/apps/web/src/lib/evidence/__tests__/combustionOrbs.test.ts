/**
 * The TS combustion-orb mirror must equal the Python constants BYTE FOR BYTE.
 *
 * WHY THIS TEST EXISTS. The engine decides `is_combust` in Python and emits only
 * the boolean plus `combustion_separation_deg`; it never emits the ORB it tested
 * against. The report needs that orb to print a checkable statement ("combust at
 * 2.76 deg against a 10 deg orb") and to decide whether a classification sits
 * near its boundary. So the table is mirrored into TS — and a mirrored constant
 * table is exactly the thing that silently diverges. This test parses the Python
 * source and compares, so a change on either side fails here by name.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { COMBUSTION_ORBS_DEG, RETROGRADE_COMBUSTION_ORBS_DEG, combustionOrbDeg } from '../combustionOrbs';

const PYTHON_SOURCE = resolve(
  import.meta.dirname,
  '../../../../../../../backend/src/almamesh/yogas/combustion.py',
);

/** Parse `PlanetName.VENUS: 10.0,` rows out of a named Python dict literal. */
function parsePythonOrbs(source: string, dictName: string): Record<string, number> {
  const block = source.split(`${dictName}: dict[PlanetName, float] = {`)[1];
  if (block === undefined) {
    throw new Error(`Python dict ${dictName} not found — the mirror cannot be checked`);
  }
  const body = block.split('}')[0];
  const parsed: Record<string, number> = {};
  for (const line of body.split('\n')) {
    const match = /PlanetName\.([A-Z]+):\s*([0-9.]+)/.exec(line);
    if (match !== null) {
      parsed[match[1].toLowerCase()] = Number.parseFloat(match[2]);
    }
  }
  return parsed;
}

describe('combustion orb mirror', () => {
  const source = readFileSync(PYTHON_SOURCE, 'utf8');

  it('mirrors the direct-motion orbs exactly', () => {
    expect({ ...COMBUSTION_ORBS_DEG }).toEqual(parsePythonOrbs(source, 'COMBUSTION_ORBS_DEG'));
  });

  it('mirrors the retrograde orbs exactly', () => {
    expect({ ...RETROGRADE_COMBUSTION_ORBS_DEG }).toEqual(
      parsePythonOrbs(source, 'RETROGRADE_COMBUSTION_ORBS_DEG'),
    );
  });

  it('prefers the tighter retrograde orb, mirroring combustion_orb_deg', () => {
    expect(combustionOrbDeg('venus', false)).toBe(10);
    expect(combustionOrbDeg('venus', true)).toBe(8);
    expect(combustionOrbDeg('mercury', true)).toBe(12);
    // Saturn has no retrograde-specific orb: the direct orb stands.
    expect(combustionOrbDeg('saturn', true)).toBe(15);
  });

  it('returns null where asta cannot apply (the Sun and the nodes)', () => {
    expect(combustionOrbDeg('sun', false)).toBeNull();
    expect(combustionOrbDeg('rahu', false)).toBeNull();
    expect(combustionOrbDeg('ketu', false)).toBeNull();
  });
});
