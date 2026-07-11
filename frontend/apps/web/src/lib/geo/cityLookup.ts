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

/**
 * Fold diacritics and lower-case so "Sao Paulo" matches stored "São Paulo" and
 * "Zurich" matches "Zürich". NFD splits accented letters into base + combining
 * mark; stripping the marks leaves the plain ASCII base.
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Split (already-folded) text into non-empty word tokens. */
function splitWords(folded: string): string[] {
  return folded.split(/[\s,]+/).filter(Boolean);
}

/** Diacritic-fold then tokenize free text into words. */
function tokenize(text: string): string[] {
  return splitWords(fold(text));
}

/**
 * Extra qualifier words the dataset's country name/code don't spell out
 * literally. Keyed by ISO 3166-1 alpha-2 code so a query like "San Francisco,
 * USA" or "London UK" resolves. "US"/"United States"/"United Kingdom"/"United
 * Arab Emirates" already fold out of the code + country name.
 */
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  US: ['usa'],
  GB: ['uk'],
  AE: ['uae'],
};

/** Country name words + code + aliases — the searchable "where" of a row. */
function qualifierWords(row: CityRow): string[] {
  return [...tokenize(row.c), fold(row.cc), ...(COUNTRY_ALIASES[row.cc] ?? [])];
}

/**
 * Do the trailing (post-city) tokens read as location qualifiers? Each must
 * prefix-match a country word / code / alias — except a SINGLE trailing token
 * may go unverified: the dataset has no state/province field, so "San
 * Francisco, CA" and "San Francisco California" each strand one qualifier we
 * can't confirm. A non-trailing stray (e.g. a stranded city word like the
 * "francisco" left over when "san" alone anchored on "Sanford") rejects the row,
 * which keeps the tolerance from producing false positives.
 */
function qualifiersOk(remainder: readonly string[], qualWords: readonly string[]): boolean {
  let unverified = 0;
  for (let i = 0; i < remainder.length; i += 1) {
    if (qualWords.some((w) => w.startsWith(remainder[i]))) continue;
    unverified += 1;
    if (unverified > 1 || i !== remainder.length - 1) return false;
  }
  return true;
}

/**
 * Match a "<city> <qualifiers>" query: the leading tokens must form the city
 * name as a contiguous word-prefix phrase (anchored from the first token, so
 * "san francisco" can't scatter across "Santiago … Caballeros"), and the rest
 * must read as location qualifiers.
 */
function cityWithQualifiers(
  nameTokens: readonly string[],
  qualWords: readonly string[],
  tokens: readonly string[],
): boolean {
  if (tokens.length <= nameTokens.length) return false;
  for (let i = 0; i < nameTokens.length; i += 1) {
    if (!nameTokens[i].startsWith(tokens[i])) return false;
  }
  return qualifiersOk(tokens.slice(nameTokens.length), qualWords);
}

/** Rank: exact name > prefix > substring > qualifier-only, then by population. */
function nameScore(foldedName: string, normQuery: string): number {
  if (foldedName === normQuery) return 3;
  if (foldedName.startsWith(normQuery)) return 2;
  if (foldedName.includes(normQuery)) return 1;
  return 0;
}

/**
 * Search the bundled city DB, diacritic-insensitively. A row matches when the
 * query is a substring of the (folded) city name, OR the query reads as
 * "<city> <state/country qualifiers>", OR every token is a country qualifier
 * (country-only search). Ranks exact > prefix > substring name matches, then by
 * population, so the most likely birth city surfaces first.
 *
 * @param query - free text (city, optionally with state/country qualifiers);
 *   queries under 2 chars return [].
 * @param limit - maximum results to return (default 8).
 */
export async function searchCities(query: string, limit = 8): Promise<CityMatch[]> {
  if (query.trim().length < 2) return [];
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const normQuery = tokens.join(' ');

  const db = await loadCityDb();
  const scored: Array<{ row: CityRow; score: number }> = [];
  for (const row of db) {
    const name = fold(row.n);
    const nameTokens = splitWords(name);
    const qualWords = qualifierWords(row);
    const matched =
      name.includes(normQuery) ||
      cityWithQualifiers(nameTokens, qualWords, tokens) ||
      tokens.every((token) => qualWords.some((w) => w.startsWith(token)));
    if (matched) scored.push({ row, score: nameScore(name, normQuery) });
  }

  scored.sort((a, b) => b.score - a.score || b.row.p - a.row.p);
  return scored.slice(0, limit).map(({ row }) => toMatch(row));
}
