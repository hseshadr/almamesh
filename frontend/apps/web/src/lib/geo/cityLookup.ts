/**
 * Offline city lookup — zero-network birth-location resolution.
 *
 * AlmaMesh's engine runs on-device (Pyodide) and the product promise is
 * local-first / no-egress. Birth-location entry therefore must NOT hit Google
 * Places or Nominatim. This module resolves a typed city to
 * { latitude, longitude, timezone (IANA) } entirely from bundled data:
 *
 *   - city list: `cities.min.json` (pre-baked from `all-the-cities`, GeoNames,
 *     population > 15k; see scripts/generate-cities.mjs). Lazy-loaded via dynamic
 *     import so it never bloats the initial chunk.
 *   - timezone: `tz-lookup` maps lat/lon -> IANA zone offline.
 *
 * The engine path (`toBirthInput`) fails closed without a valid IANA timezone,
 * so every search result carries one.
 */
import tzlookup from 'tz-lookup';

/** A city match ready to feed the onboarding store / engine. */
export interface CityMatch {
  /** Human display string, e.g. "Chennai, India". */
  displayName: string;
  /** City name, e.g. "Chennai". */
  city: string;
  /** Country display name, e.g. "India". */
  country: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "IN". */
  countryCode: string;
  latitude: number;
  longitude: number;
  /** IANA timezone derived from coordinates, e.g. "Asia/Kolkata". */
  timezone: string;
  /** Population — used for ranking and surfaced for disambiguation. */
  population: number;
}

/** Compact row shape stored in cities.min.json (keys minimised for size). */
export interface CityRow {
  n: string;
  c: string;
  cc: string;
  lat: number;
  lon: number;
  p: number;
}

let cityDbPromise: Promise<readonly CityRow[]> | null = null;

/**
 * Lazy-load the bundled city database exactly once.
 * The dynamic import keeps the ~2 MB JSON out of the initial bundle.
 */
async function loadCityDb(): Promise<readonly CityRow[]> {
  if (!cityDbPromise) {
    cityDbPromise = import('../../data/cities.min.json').then(
      (module) => module.default,
    );
  }
  return cityDbPromise;
}

/** Resolve the IANA timezone for a coordinate, offline. */
export function timezoneForCoordinates(latitude: number, longitude: number): string {
  return tzlookup(latitude, longitude);
}

function toMatch(row: CityRow): CityMatch {
  return {
    displayName: `${row.n}, ${row.c}`,
    city: row.n,
    country: row.c,
    countryCode: row.cc,
    latitude: row.lat,
    longitude: row.lon,
    timezone: timezoneForCoordinates(row.lat, row.lon),
    population: row.p,
  };
}

function scoreRow(row: CityRow, needle: string): number {
  const name = row.n.toLowerCase();
  if (name === needle) return 3;
  if (name.startsWith(needle)) return 2;
  if (name.includes(needle)) return 1;
  // Allow matching on country name (e.g. "japan") as a weak fallback.
  return row.c.toLowerCase().includes(needle) ? 0 : -1;
}

/**
 * Search the bundled city DB. Ranks exact > prefix > substring matches, then by
 * population, so the most likely birth city surfaces first.
 *
 * @param query - free text (city or country); queries under 2 chars return [].
 * @param limit - maximum results to return (default 8).
 */
export async function searchCities(query: string, limit = 8): Promise<CityMatch[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const db = await loadCityDb();
  const scored: Array<{ row: CityRow; score: number }> = [];
  for (const row of db) {
    const score = scoreRow(row, needle);
    if (score >= 0) scored.push({ row, score });
  }

  scored.sort((a, b) => b.score - a.score || b.row.p - a.row.p);
  return scored.slice(0, limit).map(({ row }) => toMatch(row));
}
