/**
 * report-pdf/types — the PURE, pre-reshaped data contract for the PDF document.
 *
 * The @react-pdf document NEVER touches the engine, the store, or astrology. It
 * renders an already-formatted, presentation-ready object. `ReportView` builds
 * this object from the engine output via the existing `lib/reportData.ts`
 * formatters; the Node render harness supplies literal fixture strings. Same
 * contract, two producers — calculation integrity preserved (the engine is the
 * single source of truth; this layer only renders).
 *
 * Every field is a finished display string (already in the BIRTH timezone, already
 * locale-formatted) — the document does no recomputation. The kundli charts ride
 * along as the renderer-agnostic `ChartGeometry` the on-screen SVGs already use
 * (house/sign placement, planet glyphs) — pure geometry, never recomputed here.
 */

import type { ChartGeometry } from '@almamesh/store';

/** The pair of kundli charts (D1 Rāśi + optional D9 Navāṁśa), as geometry. */
export interface ReportPdfCharts {
  /** The natal D1 chart geometry (degree-precision). */
  readonly rasi: ChartGeometry;
  /** Caption for the D1 plate, e.g. "Rāśi · D1". */
  readonly rasiCaption: string;
  /** The D9 navamsa geometry (sign-precision); null when the engine omits it. */
  readonly navamsa: ChartGeometry | null;
  /** Caption for the D9 plate, e.g. "Navāṁśa · D9". */
  readonly navamsaCaption: string;
}

/** A single label/value readout in the birth-details data list. */
export interface ReportPdfDetail {
  readonly label: string;
  /** Pre-formatted value. Mono-styled when `mono` is true (degrees / coords). */
  readonly value: string;
  readonly mono?: boolean;
}

/** A technical engine readout (ayanamsa, house system, …). */
export interface ReportPdfTechnical {
  readonly label: string;
  readonly value: string;
}

/** One row of the planetary-positions table — all values pre-formatted. */
export interface ReportPdfPlanetRow {
  /** Display name, e.g. "Sun", "Ascendant". */
  readonly name: string;
  /** Two-letter abbreviation glyph, e.g. "Su" (empty for the Lagna row). */
  readonly glyph: string;
  /** Sign name, e.g. "Pisces". */
  readonly sign: string;
  /** Within-sign degree readout, e.g. "15°41′" (already glyph-safe). */
  readonly degree: string;
  /** Nakshatra + pada, e.g. "Uttara Bhadrapada · 4". */
  readonly nakshatra: string;
  /** Whole-sign house number as a string, e.g. "1" ("—" for the Lagna row). */
  readonly house: string;
  /** Dignity label, title-cased ("Exalted" / "Debilitated" / "" when neutral). */
  readonly dignity: string;
  /** True → an ASCII "(R)" retrograde mark is shown next to the degree. */
  readonly isRetrograde: boolean;
  /** True → the row is dimmed (combust planet). */
  readonly isCombust: boolean;
  /** Hex accent for the glyph chip (paper-legible planet ink). */
  readonly color: string;
}

/** One Vimshottari dasha period — pre-formatted dates + duration. */
export interface ReportPdfDashaPeriod {
  /** Title-cased ruling graha, e.g. "Saturn". */
  readonly lord: string;
  /** Pre-formatted start date, e.g. "Jan 2017" (epoch-safe). */
  readonly start: string;
  /** Pre-formatted end date, e.g. "Jan 2036" (epoch-safe). */
  readonly end: string;
  /** Span label, e.g. "19 yrs". */
  readonly span: string;
  /** True → this period is the one currently running (brass-marked). */
  readonly isCurrent: boolean;
}

/** One antar-daśā drill-down table: a (localized) heading + its nine periods. */
export interface ReportPdfAntarTable {
  /** Pre-localized heading, e.g. "Antar-daśās of the Saturn Mahā-daśā". */
  readonly heading: string;
  readonly periods: ReadonlyArray<ReportPdfDashaPeriod>;
}

/** The dasha timeline slice: the maha sequence + the current focus line. */
export interface ReportPdfDasha {
  /** The nine maha-dasha periods, in order. */
  readonly mahaSequence: ReadonlyArray<ReportPdfDashaPeriod>;
  /** The current Maha · Antar · Pratyantar focus, pre-formatted (may be empty). */
  readonly currentFocus: string;
  /**
   * The antar-daśā drill-down of EVERY mahā (in mahā order) — the definitive
   * reference tables. Empty on older payloads without period depth.
   */
  readonly antarTables: ReadonlyArray<ReportPdfAntarTable>;
}

/** One whole-sign house row — all values pre-formatted. */
export interface ReportPdfHouseRow {
  /** House number as a string, "1"–"12". */
  readonly house: string;
  /** Sign name, e.g. "Aries". */
  readonly sign: string;
  /** Title-cased sign lord, e.g. "Mars". */
  readonly signLord: string;
  /** Occupying grahas, comma-joined ("Sun, Ketu"), or "—" when empty. */
  readonly occupants: string;
}

/** One yoga — name, classification, and description, all pre-formatted. */
export interface ReportPdfYoga {
  /** Display name, e.g. "Malavya Yoga". */
  readonly name: string;
  /** Category + grade chip text, e.g. "Mahapurusha · Strong". */
  readonly classification: string;
  /** The descriptive sentence(s) for this yoga. */
  readonly description: string;
  /** Planets involved, pre-formatted, e.g. "Venus". */
  readonly signature: string;
  /** Grade, used to tint the chip ("strong" | "moderate" | "weak"). */
  readonly grade: string;
}

/** One interpretation block — an optional heading + ordered prose paragraphs. */
export interface ReportPdfNarrativeSection {
  /** Section heading, e.g. "Strengths" (empty → no heading, e.g. the summary). */
  readonly title: string;
  /** Ordered paragraphs of prose (already plain text, markdown stripped). */
  readonly paragraphs: ReadonlyArray<string>;
}

/* ── Comprehensive (predictive + rectification) section slices ─────────────
 * Every field below is a FINISHED display string, pre-localized by the
 * builders (which reuse the exact same i18n helpers as the on-screen report,
 * so PDF and web copy never drift). The PDF components render them verbatim.
 */

/** The eyebrow / title / intro chrome every comprehensive section opens with. */
export interface ReportPdfSectionChrome {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro?: string;
}

/** A short label → value readout line (panel row). */
export interface ReportPdfLabeledValue {
  readonly label: string;
  readonly value: string;
}

/** One generic table row; `emphasis` brass-tints it (totals / running rows). */
export interface ReportPdfTableRow {
  readonly cells: ReadonlyArray<string>;
  readonly emphasis?: boolean;
}

/** A generic pre-formatted table (headers repeat when it breaks across pages). */
export interface ReportPdfTable {
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReportPdfTableRow>;
  /** Optional per-column flex weights (defaults to equal columns). */
  readonly widths?: ReadonlyArray<number>;
}

/** Section VIII — Transits & Timing (engine TransitCtx, pre-formatted). */
export interface ReportPdfTransits {
  readonly chrome: ReportPdfSectionChrome;
  /** "Sidereal sky positions for …" line. */
  readonly asOf: string;
  readonly gochara: ReportPdfTable;
  readonly sadeSatiHeading: string;
  readonly sadeSati: ReadonlyArray<ReportPdfLabeledValue>;
  readonly slowHitsHeading: string;
  readonly slowHits: ReportPdfTable;
  /** Shown instead of the table when the engine emitted no slow hits. */
  readonly slowHitsEmpty: string;
  readonly fusionHeading: string;
  readonly fusion: ReadonlyArray<ReportPdfLabeledValue>;
  readonly timelineHeading: string;
  readonly timeline: ReportPdfTable;
  readonly timelineEmpty: string;
}

/** One framed divisional-chart plate (sign-precision geometry, no degrees). */
export interface ReportPdfVargaPlate {
  readonly id: string;
  /** Localized caption, e.g. "D9 · Navāṁśa". */
  readonly caption: string;
  readonly geometry: ChartGeometry;
}

/** Section IX — all sixteen divisional charts + the classical tallies. */
export interface ReportPdfVargas {
  readonly chrome: ReportPdfSectionChrome;
  readonly note: string;
  /** Up to 16 plates, canonical D1→D60 order (only emitted charts). */
  readonly plates: ReadonlyArray<ReportPdfVargaPlate>;
  readonly vargottamaHeading: string;
  /** Pre-joined vargottama line, or the localized empty-state text. */
  readonly vargottamaLine: string;
  readonly vimshopakaHeading: string;
  readonly vimshopaka: ReportPdfTable;
  /** The ≈-approximation footnote, present only when any score carries it. */
  readonly approxNote?: string;
}

/** Section X — Ashtakavarga (SAV + BAV) and six-component Shadbala. */
export interface ReportPdfStrength {
  readonly chrome: ReportPdfSectionChrome;
  /** SAV heading including the canonical total, pre-formatted. */
  readonly savHeading: string;
  /** The 12 per-sign SAV bindu cells, in zodiac order. */
  readonly savCells: ReadonlyArray<ReportPdfLabeledValue>;
  readonly bavHeading: string;
  /** Sign × graha bindu matrix, closed by an emphasised totals row. */
  readonly bav: ReportPdfTable;
  readonly shadbalaHeading: string;
  /** Graha · six components (virūpas) · rūpa totals · verdict. */
  readonly shadbala: ReportPdfTable;
  readonly componentsNote: string;
  readonly approxNote?: string;
  readonly sunriseNote: string;
}

/** One life-domain forecast block, fully pre-formatted. */
export interface ReportPdfDomainBlock {
  readonly name: string;
  readonly band: string;
  readonly strengthLine: string;
  readonly emphasisLine: string;
  readonly windowsLabel: string;
  readonly windows: ReadonlyArray<string>;
  readonly windowsEmpty: string;
}

/** Section XI — the seven deterministic life-domain forecasts. */
export interface ReportPdfDomains {
  readonly chrome: ReportPdfSectionChrome;
  readonly blocks: ReadonlyArray<ReportPdfDomainBlock>;
}

/**
 * Section XII — Birth Time Authority. QUALITATIVE ONLY by contract: the facts
 * carry the entered/working clocks + signs, mode, band and confirm date —
 * never a percentage, margin number, or fit score.
 */
export interface ReportPdfRectification {
  readonly chrome: ReportPdfSectionChrome;
  readonly facts: ReadonlyArray<ReportPdfLabeledValue>;
  readonly eventsHeading: string;
  readonly events: ReportPdfTable;
  /** Shown instead of the table when no supporting events resolved. */
  readonly eventsEmpty: string;
  readonly caveat: string;
  /**
   * Phase 2 (Spec 062, v2 records with a resultSnapshot): the full evidence
   * story — candidate comparison, per-event evidence with depth/polarity
   * labels, quiet-period misses, and the prior note. All optional so v1
   * records keep rendering the classic section unchanged. Qualitative only.
   */
  readonly candidatesHeading?: string;
  readonly candidates?: ReportPdfTable;
  readonly evidenceHeading?: string;
  readonly evidence?: ReportPdfTable;
  readonly missesHeading?: string;
  readonly missNotes?: ReadonlyArray<string>;
  readonly priorNote?: string;
}

/** The cover + birth-details slice (the foundation; more sections follow). */
export interface ReportPdfData {
  /** Document title / person name. */
  readonly personName: string;
  /** Audience voice label, already localized ("For You" / "For the Astrologer"). */
  readonly audienceLabel: string;
  /** A short, elegant subtitle line under the name (already localized). */
  readonly subtitle: string;
  /** Brand kicker on the cover (already localized). */
  readonly kicker: string;
  /** "Generated on …" line, epoch-safe + locale-formatted. */
  readonly generatedOn: string;

  /** The birth-details list (date, time, place, ascendant — all pre-formatted). */
  readonly birthDetails: ReadonlyArray<ReportPdfDetail>;
  /**
   * An optional honesty note rendered under the ascendant (e.g. the near-cusp
   * caveat). Already localized; omitted when not applicable.
   */
  readonly ascendantNote?: string;
  /**
   * An optional note on the cover stating that this chart was computed from a
   * *rectified* birth time — names the entered → rectified clocks + signed
   * minutes. Already localized; omitted when no rectification is in effect.
   */
  readonly rectifiedNote?: string;
  /** Technical engine readouts (ayanamsa, house system). */
  readonly technical: ReadonlyArray<ReportPdfTechnical>;

  /** The planetary-positions table (9 grahas + the Lagna row). */
  readonly planets: ReadonlyArray<ReportPdfPlanetRow>;
  /** The 12 whole-sign house rows (sign, lord, occupants). */
  readonly houses: ReadonlyArray<ReportPdfHouseRow>;
  /** The two kundli charts (D1 + optional D9), as geometry. */
  readonly charts: ReportPdfCharts;
  /** The Vimshottari dasha timeline. */
  readonly dasha: ReportPdfDasha;
  /** The engine's yogas. */
  readonly yogas: ReadonlyArray<ReportPdfYoga>;
  /**
   * The structured interpretation, as ordered narrative blocks. OPTIONAL: when
   * the LLM interpretation has not been generated yet, the report degrades to
   * its deterministic natal halves and this is `undefined` — the document then
   * omits the Interpretation section entirely (never a blank/broken page).
   */
  readonly narrative?: ReadonlyArray<ReportPdfNarrativeSection>;

  /* Comprehensive sections — present only when the on-device predictive
     contexts were computed (transits/vargas/strength/domains) or a confirmed
     rectification record exists. The document omits absent sections entirely
     (never a blank page): the PDF mirrors exactly what the web report shows. */
  readonly transits?: ReportPdfTransits;
  readonly vargas?: ReportPdfVargas;
  readonly strength?: ReportPdfStrength;
  readonly domains?: ReportPdfDomains;
  readonly rectification?: ReportPdfRectification;

  /** Localized static labels the document needs (keeps i18n out of the PDF layer). */
  readonly labels: ReportPdfLabels;
}

/** Localized chrome strings the document renders verbatim. */
export interface ReportPdfLabels {
  readonly preparedFor: string;
  readonly birthDetailsTitle: string;
  readonly birthDetailsEyebrow: string;
  readonly birthDetailsIntro: string;
  readonly technicalNote: string;
  readonly footerNote: string;

  /** Planetary-positions section. */
  readonly planetsEyebrow: string;
  readonly planetsTitle: string;
  readonly planetsIntro: string;
  /** Column headers for the planet table. */
  readonly colPlanet: string;
  readonly colSign: string;
  readonly colDegree: string;
  readonly colNakshatra: string;
  readonly colHouse: string;
  readonly colDignity: string;
  readonly lagnaRowName: string;

  /** Houses section. */
  readonly housesEyebrow: string;
  readonly housesTitle: string;
  readonly housesIntro: string;
  readonly colHouseNumber: string;
  readonly colHouseSign: string;
  readonly colHouseLord: string;
  readonly colOccupants: string;
  readonly housesNote: string;

  /** Kundli charts section. */
  readonly chartsEyebrow: string;
  readonly chartsTitle: string;
  readonly chartsIntro: string;

  /** Dasha section. */
  readonly dashaEyebrow: string;
  readonly dashaTitle: string;
  readonly dashaIntro: string;
  readonly dashaCurrentLabel: string;
  readonly dashaSequenceLabel: string;

  /** Yogas section. */
  readonly yogasEyebrow: string;
  readonly yogasTitle: string;
  readonly yogasIntro: string;

  /** Interpretation section. */
  readonly narrativeEyebrow: string;
  readonly narrativeTitle: string;
  readonly narrativeIntro: string;
}
