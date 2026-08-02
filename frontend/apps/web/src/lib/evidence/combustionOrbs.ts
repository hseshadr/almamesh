/**
 * Combustion (asta) orbs — a guarded TS mirror of the Python constants.
 *
 * The engine decides `is_combust` in Python and emits the boolean plus
 * `combustion_separation_deg`. It does NOT emit the orb it tested against, so a
 * report that wants to print a checkable statement — "combust at 2.76 deg
 * against a 10 deg orb" instead of "combust" — has to know the orb.
 *
 * A mirrored constant table is precisely the thing that silently diverges, so
 * `__tests__/combustionOrbs.test.ts` parses the Python source and compares.
 * Change either side without the other and that test fails by name.
 *
 * Source of truth: `backend/src/almamesh/yogas/combustion.py`.
 */

/** Classical asta orbs for a graha in direct motion. Keys are engine planet names. */
export const COMBUSTION_ORBS_DEG: Readonly<Record<string, number>> = {
  moon: 12.0,
  mars: 17.0,
  mercury: 14.0,
  jupiter: 11.0,
  venus: 10.0,
  saturn: 15.0,
};

/** Tighter orbs while retrograde (same classical source). */
export const RETROGRADE_COMBUSTION_ORBS_DEG: Readonly<Record<string, number>> = {
  mercury: 12.0,
  venus: 8.0,
};

/**
 * The orb this graha was tested against, or null where asta cannot apply
 * (the Sun itself and the shadow nodes carry no orb). Mirrors the Python
 * `combustion_orb_deg`: a retrograde-specific orb wins when one exists.
 */
export function combustionOrbDeg(planet: string, retrograde: boolean): number | null {
  const key = planet.toLowerCase();
  if (retrograde && key in RETROGRADE_COMBUSTION_ORBS_DEG) {
    return RETROGRADE_COMBUSTION_ORBS_DEG[key];
  }
  return key in COMBUSTION_ORBS_DEG ? COMBUSTION_ORBS_DEG[key] : null;
}
