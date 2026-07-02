// Ground-truth fence checker: mechanically flag narration claims that
// contradict the engine's chart JSON (Spec 063 D4).
//
// PRECISION over recall, by design: a flagged violation must be real, because
// the report re-ranks BLESSED_ONDEVICE_MODELS on these numbers. Heuristic
// recall gaps (documented in bench/README.md) are acceptable; false flags are
// not — every rule below therefore carries negation/hypothetical/divisional
// guards and only fires on explicit, parseable claims.
//
// Checks:
//   (a) lordship  — "X rules the Nth house" (and common phrasings) vs houses_ruled
//   (b) dasha_date — years/month-years presented as period dates vs engine windows
//   (c) dignity   — exalted/debilitated/own-sign vocabulary vs engine dignity
//   (d) invented_yoga — "<Name> yoga" claims vs the engine's detected-yoga list

import type { EngineTruth, FenceViolation, DashaLevel } from "./types";

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

/** Strip diacritics + lowercase so es/pt planet names match one lexicon. */
export function deaccent(text: string): string {
  return deaccentKeepCase(text).toLowerCase();
}

/** Strip diacritics but KEEP case \u2014 the yoga check uses capitalization as signal. */
export function deaccentKeepCase(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

function sentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function excerpt(s: string, max = 140): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// Canonical planet lexicon (en + es + pt, deaccented).
const PLANET_ALIASES: ReadonlyMap<string, string> = new Map([
  ["sun", "sun"],
  ["sol", "sun"],
  ["moon", "moon"],
  ["luna", "moon"],
  ["lua", "moon"],
  ["mars", "mars"],
  ["marte", "mars"],
  ["mercury", "mercury"],
  ["mercurio", "mercury"],
  ["jupiter", "jupiter"],
  ["venus", "venus"],
  ["saturn", "saturn"],
  ["saturno", "saturn"],
  ["rahu", "rahu"],
  ["ketu", "ketu"],
]);

const PLANET_PATTERN = [...PLANET_ALIASES.keys()].join("|");
const PLANET_RE = new RegExp(`\\b(${PLANET_PATTERN})\\b`, "g");

interface PlanetHit {
  readonly canonical: string;
  readonly index: number;
}

function planetsIn(text: string): PlanetHit[] {
  const hits: PlanetHit[] = [];
  for (const m of text.matchAll(PLANET_RE)) {
    hits.push({ canonical: PLANET_ALIASES.get(m[1]) ?? m[1], index: m.index ?? 0 });
  }
  return hits;
}

// Ordinal house tokens: "10th", "tenth", "house 10".
const WORD_ORDINALS: ReadonlyMap<string, number> = new Map([
  ["first", 1],
  ["second", 2],
  ["third", 3],
  ["fourth", 4],
  ["fifth", 5],
  ["sixth", 6],
  ["seventh", 7],
  ["eighth", 8],
  ["ninth", 9],
  ["tenth", 10],
  ["eleventh", 11],
  ["twelfth", 12],
]);

const HOUSE_TOKEN =
  "(?:(\\d{1,2})(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)";

function houseFromToken(token: string): number | null {
  const digits = /^(\d{1,2})/.exec(token);
  const n = digits ? Number(digits[1]) : (WORD_ORDINALS.get(token) ?? null);
  return n !== null && n >= 1 && n <= 12 ? n : null;
}

/** All house numbers referenced in a snippet (ordinals or "house N"). */
function housesIn(snippet: string): number[] {
  const found: number[] = [];
  const re = new RegExp(`${HOUSE_TOKEN}|\\bhouses?\\s+(\\d{1,2})\\b`, "g");
  for (const m of snippet.matchAll(re)) {
    const token = m[1] ?? m[2] ?? m[0];
    const n = houseFromToken(token);
    if (n !== null && !found.includes(n)) {
      found.push(n);
    }
  }
  return found;
}

const NEGATION_RE = /\b(?:not|isn'?t|doesn'?t|does not|never|no longer|nao|no)\b/;
const HYPOTHETICAL_RE = /\b(?:if|would|were|hypothetical|imagine)\b/;
const DIVISIONAL_RE = /\b(?:navamsa|navamsha|d-?9|d-?\d{1,2}|varga|divisional)\b/;

// ---------------------------------------------------------------------------
// (a) Lordship claims
// ---------------------------------------------------------------------------

const FORWARD_LORDSHIP_RE = new RegExp(
  `\\b(${PLANET_PATTERN})\\b[^.!?;]{0,40}?\\b(?:rules|governs|owns|lords(?: over)?|is (?:the )?(?:lord|ruler) of)\\b([^.!?;]{0,90})`,
  "g",
);

// Words allowed INSIDE the house-token run that follows a lordship verb:
// articles, connectors, "house(s)" and the house tokens themselves. The claim
// window ends at the first word outside this set, so a trailing clause
// ("rules the 7th and aspects the 3rd") cannot bind its house to the verb
// (smoke-run false-flag fix), while "rules the 7th and 8th houses" still
// binds both houses.
const LORDSHIP_RUN_WORD_RE = new RegExp(
  `^(?:the|your|both|and|y|e|or|o|ou|plus|houses?|casas?|\\d{1,2}|${HOUSE_TOKEN})$`,
);

/** Truncate a forward-lordship tail at the first non-house-run word. */
function lordshipClaimWindow(tail: string): string {
  const kept: string[] = [];
  for (const word of tail.split(/\s+/)) {
    const bare = word.replace(/[^a-z0-9]/g, "");
    if (bare.length > 0 && !LORDSHIP_RUN_WORD_RE.test(bare)) {
      break;
    }
    kept.push(word);
  }
  return kept.join(" ");
}

// "the lord of the 7th house is venus" / "7th lord venus" — short connector
// window on purpose: "lord of the 7th is in the 8th with venus" must NOT bind.
const REVERSED_LORDSHIP_RE = new RegExp(
  `\\b(?:lord|ruler) of (?:the )?${HOUSE_TOKEN}(?: house)?[^a-z0-9]{0,3}(?:is )?[^a-z0-9]{0,3}\\b(${PLANET_PATTERN})\\b`,
  "g",
);

const NTH_LORD_RE = new RegExp(
  `\\b${HOUSE_TOKEN}(?:[- ]house)?[- ]lord\\b[^a-z0-9]{0,3}(?:is )?[^a-z0-9]{0,3}\\b(${PLANET_PATTERN})\\b`,
  "g",
);

const PLANET_AS_NTH_LORD_RE = new RegExp(
  `\\b(${PLANET_PATTERN})\\b[^.!?;]{0,15}?\\b(?:as |the |your )?${HOUSE_TOKEN}(?:[- ]house)?[- ]lord\\b`,
  "g",
);

const LAGNA_LORD_RE = new RegExp(
  `\\b(?:lagna|ascendant)[- ]lord\\b[^a-z0-9]{0,3}(?:is )?[^a-z0-9]{0,3}\\b(${PLANET_PATTERN})\\b`,
  "g",
);

function checkLordshipClaim(
  truth: EngineTruth,
  planetAlias: string,
  house: number,
  claimText: string,
  out: FenceViolation[],
): void {
  const planet = PLANET_ALIASES.get(planetAlias) ?? planetAlias;
  const ruled = truth.lordships.get(planet);
  if (ruled === undefined || ruled.includes(house)) {
    return;
  }
  out.push({
    kind: "lordship",
    claim: excerpt(claimText),
    detail: `${planet} rules [${ruled.join(",") || "nothing"}], not house ${house}`,
  });
}

function checkLordships(truth: EngineTruth, sentence: string, out: FenceViolation[]): void {
  if (NEGATION_RE.test(sentence) || HYPOTHETICAL_RE.test(sentence) || DIVISIONAL_RE.test(sentence)) {
    return;
  }
  for (const m of sentence.matchAll(FORWARD_LORDSHIP_RE)) {
    // Bound the claim window to the house-token run directly after the verb —
    // a following clause ("... and aspects the 3rd") must not bind.
    const tail = lordshipClaimWindow(m[2]);
    // Guard: the tail must actually reference houses ("rules discipline",
    // "rules sagittarius" carry no house token and are skipped).
    for (const house of housesIn(tail)) {
      checkLordshipClaim(truth, m[1], house, m[0], out);
    }
  }
  const reversedPatterns = [REVERSED_LORDSHIP_RE, NTH_LORD_RE];
  for (const re of reversedPatterns) {
    for (const m of sentence.matchAll(re)) {
      const house = housesIn(m[0])[0];
      const planet = m[2] ?? m[1];
      if (house !== undefined && planet !== undefined) {
        checkLordshipClaim(truth, planet, house, m[0], out);
      }
    }
  }
  for (const m of sentence.matchAll(PLANET_AS_NTH_LORD_RE)) {
    const house = housesIn(m[0])[0];
    if (house !== undefined) {
      checkLordshipClaim(truth, m[1], house, m[0], out);
    }
  }
  for (const m of sentence.matchAll(LAGNA_LORD_RE)) {
    checkLordshipClaim(truth, m[1], 1, m[0], out);
  }
}

// ---------------------------------------------------------------------------
// (b) Dasha date claims
// ---------------------------------------------------------------------------

const DASHA_CONTEXT_RE =
  /\b(?:maha\s?dasha|mahadasha|antar\s?dasha|antardasha|pratyantar(?:\s?dasha)?|dasha|dasa|bhukti)\b/;
const MAHA_RE = /\b(?:maha\s?dasha|mahadasha)\b/;
const ANTAR_RE = /\b(?:antar\s?dasha|antardasha|bhukti)\b/;
const PRATYANTAR_RE = /\bpratyantar(?:\s?dasha)?\b/;
const BIRTH_RE = /\b(?:born|birth|nacio|nacida?o?|nasceu|nascimento)\b/;

const MONTHS: ReadonlyMap<string, number> = new Map([
  // en
  ...Object.entries({
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
    august: 8, september: 9, october: 10, november: 11, december: 12,
  }),
  // es (deaccented)
  ...Object.entries({
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
    agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  }),
  // pt (deaccented; overlapping names share the same index)
  ...Object.entries({
    janeiro: 1, fevereiro: 2, marco: 3, maio: 5, junho: 6, julho: 7,
    setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  }),
] as ReadonlyArray<[string, number]>);

const YEAR_RE = /\b((?:19|20)\d{2})\b/g;

interface DateClaim {
  readonly year: number;
  /** 1-12 when a month name directly precedes the year; null for bare years. */
  readonly month: number | null;
}

function dateClaimsIn(sentence: string): DateClaim[] {
  const claims: DateClaim[] = [];
  for (const m of sentence.matchAll(YEAR_RE)) {
    const year = Number(m[1]);
    const before = sentence.slice(Math.max(0, (m.index ?? 0) - 22), m.index ?? 0);
    let month: number | null = null;
    for (const [name, num] of MONTHS) {
      if (new RegExp(`\\b${name}\\b(?:\\s+(?:de|of))?\\s*$`).test(before)) {
        month = num;
        break;
      }
    }
    claims.push({ year, month });
  }
  return claims;
}

function levelsHinted(sentence: string): readonly DashaLevel[] {
  const levels: DashaLevel[] = [];
  if (MAHA_RE.test(sentence)) levels.push("maha");
  if (ANTAR_RE.test(sentence)) levels.push("antar");
  if (PRATYANTAR_RE.test(sentence)) levels.push("pratyantar");
  return levels;
}

function claimInsideWindow(claim: DateClaim, start: Date, end: Date): boolean {
  if (claim.month === null) {
    return claim.year >= start.getUTCFullYear() && claim.year <= end.getUTCFullYear();
  }
  const claimMonths = claim.year * 12 + (claim.month - 1);
  const startMonths = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const endMonths = end.getUTCFullYear() * 12 + end.getUTCMonth();
  return claimMonths >= startMonths && claimMonths <= endMonths;
}

function checkDashaDates(truth: EngineTruth, sentence: string, out: FenceViolation[]): void {
  if (!DASHA_CONTEXT_RE.test(sentence) || BIRTH_RE.test(sentence)) {
    return;
  }
  const planets = new Set(planetsIn(sentence).map((p) => p.canonical));
  if (planets.size === 0) {
    return;
  }
  const claims = dateClaimsIn(sentence);
  if (claims.length === 0) {
    return;
  }
  // When exactly one level keyword class appears, restrict to that level; a
  // mixed sentence ("saturn mahadasha, venus antardasha 2027") checks any level.
  const hinted = levelsHinted(sentence);
  const levels: readonly DashaLevel[] =
    hinted.length === 1 ? hinted : ["maha", "antar", "pratyantar"];

  for (const claim of claims) {
    // Precision-first: a year is only a violation when NO planet mentioned in
    // the sentence has ANY engine window (at the hinted level) covering it.
    const covered = truth.periods.some(
      (p) =>
        planets.has(p.lord) &&
        levels.includes(p.level) &&
        claimInsideWindow(claim, p.start, p.end),
    );
    if (!covered) {
      out.push({
        kind: "dasha_date",
        claim: excerpt(sentence),
        detail: `${claim.month !== null ? `${claim.month}/` : ""}${claim.year} is outside every engine ${
          hinted.length === 1 ? hinted[0] : "dasha"
        } window of [${[...planets].join(", ")}]`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// (c) Dignity vocabulary
// ---------------------------------------------------------------------------

interface DignityWord {
  readonly re: RegExp;
  readonly dignity: string;
}

// Adjectival/attributive forms ONLY (smoke-run hardening): bare nouns like
// "exaltation and debilitation" appear in generic preambles ("as for
// exaltation and debilitation, ...") and false-flag; "señor de ese domicilio"
// is a HOUSE-lord phrase, not an own-sign claim, so the es/pt domicile
// pattern requires the possessive "en su / em seu domicilio" form.
const DIGNITY_WORDS: readonly DignityWord[] = [
  { re: /\bexalted\b|\bexaltad[oa]\b|\bin exaltation\b/g, dignity: "exalted" },
  { re: /\bdebilitated\b|\bdebilitad[oa]\b|\bin debilitation\b/g, dignity: "debilitated" },
  {
    re: /\bown[- ]sign\b|\bin (?:its|his|her) own sign\b|\ben su (?:propio )?domicilio\b|\bem seu (?:proprio )?domicilio\b|\bsigno propio\b|\bpropio signo\b|\bproprio signo\b|\bsigno proprio\b/g,
    dignity: "own",
  },
];

function checkDignities(truth: EngineTruth, sentence: string, out: FenceViolation[]): void {
  if (DIVISIONAL_RE.test(sentence) || HYPOTHETICAL_RE.test(sentence)) {
    return;
  }
  const planets = planetsIn(sentence);
  if (planets.length === 0) {
    return;
  }
  for (const { re, dignity } of DIGNITY_WORDS) {
    for (const m of sentence.matchAll(re)) {
      const at = m.index ?? 0;
      // Local negation guard: "saturn is not exalted" must not flag.
      const before = sentence.slice(Math.max(0, at - 30), at);
      if (NEGATION_RE.test(before)) {
        continue;
      }
      // Bind to the NEAREST planet mention — avoids cross-planet false flags.
      let nearest = planets[0];
      for (const p of planets) {
        if (Math.abs(p.index - at) < Math.abs(nearest.index - at)) {
          nearest = p;
        }
      }
      if (Math.abs(nearest.index - at) > 70) {
        continue; // too far to be a confident attribution
      }
      const engineDignity = truth.dignities.get(nearest.canonical);
      if (engineDignity !== undefined && engineDignity !== dignity) {
        out.push({
          kind: "dignity",
          claim: excerpt(sentence),
          detail: `${nearest.canonical} is "${engineDignity}" per the engine, narration says "${dignity}"`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// (d) Invented yogas
// ---------------------------------------------------------------------------

// Words that make "<X> yoga" a non-claim ("this powerful yoga", "no yogas").
const YOGA_STOPWORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "any", "no", "some",
  "such", "your", "their", "his", "her", "its", "one", "two", "several",
  "multiple", "many", "few", "other", "another", "main", "major", "key",
  "notable", "important", "powerful", "strong", "weak", "rare", "special",
  "specific", "classical", "vedic", "auspicious", "inauspicious", "benefic",
  "malefic", "beneficial", "challenging", "detected", "present", "formed",
  "active", "significant", "prominent", "famous", "well-known", "known",
  "called", "named", "planetary", "positive", "negative", "of", "in", "and",
  "or", "is", "are", "was", "has", "have", "with", "without", "un", "una",
  "este", "esta", "estos", "ese", "esse", "essa", "um", "uma", "seu", "sua",
]);

// CAPITALIZATION GATE (smoke-run hardening): a named-yoga claim is a run of
// Capitalized words directly before "yoga" ("Gaja-Kesari yoga", "Neecha
// Bhanga Yoga"). Generic prose mentions ("several significant yogas", "see
// any yogas", "presencia de varios yogas") are lowercase and skipped — the
// cost is missing an all-lowercase invented name (documented blind spot).
const YOGA_MENTION_RE = /((?:[A-Z][A-Za-z-]{1,24}\s+){0,3})[Yy]ogas?\b/g;

function normalizeCandidate(words: readonly string[]): string {
  return words.join("").replace(/[^a-z0-9]+/g, "");
}

/** `cased` keeps capitalization (deaccented); `lower` is the deaccented lowercase twin. */
function checkYogas(
  truth: EngineTruth,
  cased: string,
  lower: string,
  out: FenceViolation[],
): void {
  if (NEGATION_RE.test(lower) || HYPOTHETICAL_RE.test(lower)) {
    return;
  }
  for (const m of cased.matchAll(YOGA_MENTION_RE)) {
    const rawWords = m[1]
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    // Drop leading stopwords ("the powerful gaja-kesari yoga" -> gaja-kesari).
    while (rawWords.length > 0 && YOGA_STOPWORDS.has(rawWords[0])) {
      rawWords.shift();
    }
    if (rawWords.length === 0 || rawWords.every((w) => YOGA_STOPWORDS.has(w))) {
      continue; // generic mention, not a named-yoga claim
    }
    // Longest suffix first: "vipareeta raja yoga" matches before "raja yoga".
    let matched = false;
    for (let k = rawWords.length; k >= 1 && !matched; k--) {
      const suffix = rawWords.slice(rawWords.length - k);
      if (suffix.every((w) => YOGA_STOPWORDS.has(w))) {
        continue;
      }
      const cand = normalizeCandidate(suffix);
      if (cand.length < 3) {
        continue;
      }
      for (const name of truth.yogaNames) {
        if (name.length >= 3 && (name.includes(cand) || cand.includes(name))) {
          matched = true;
          break;
        }
      }
      // Category-generic claims ("a raja yoga") pass when the chart HAS one.
      if (!matched && k === 1 && truth.yogaCategories.has(cand)) {
        matched = true;
      }
    }
    if (!matched) {
      out.push({
        kind: "invented_yoga",
        claim: excerpt(m[0].toLowerCase()),
        detail: `"${rawWords.join(" ")} yoga" is not in the engine's detected-yoga list`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Mechanically flag narration claims that contradict the engine's ground
 * truth. Checks (a)-(c) run on a deaccented lowercase copy; the yoga check
 * additionally sees the case-preserved sentence (capitalization gate).
 * Violations are deduped on (kind, claim, detail) — one sentence matching a
 * rule twice ("exalted" + "in exaltation") counts once.
 */
export function fenceCheck(truth: EngineTruth, narration: string): FenceViolation[] {
  const out: FenceViolation[] = [];
  for (const sentence of sentences(deaccentKeepCase(narration))) {
    const lower = sentence.toLowerCase();
    checkLordships(truth, lower, out);
    checkDashaDates(truth, lower, out);
    checkDignities(truth, lower, out);
    checkYogas(truth, sentence, lower, out);
  }
  const seen = new Set<string>();
  return out.filter((v) => {
    const key = `${v.kind}|${v.claim}|${v.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
