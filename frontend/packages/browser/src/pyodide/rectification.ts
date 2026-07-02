// TS mirror of the Python rectification wire contract.
//
// `RectificationInput` is the camelCase payload sent FROM the main thread TO
// the Pyodide Worker; the Python bootstrap function translates the camelCase
// keys to the snake_case args `compute_rectification_result` expects.
//
// The `*Raw` interfaces are the EXACT snake_case shapes emitted by
// `model_dump(mode="json")` on the backend Pydantic models (rectification/models.py).
// They are consumed by the store adapter, which reshapes them into the
// camelCase `@almamesh/shared-types` contract.
//
// NOTE: Types below are intentionally LOCAL to this module (not imported from
// `@almamesh/shared-types`) so this file carries no cross-package dependency.
// The canonical definitions live in shared-types; keep them in sync.

// ---------------------------------------------------------------------------
// Local type aliases (mirrored from @almamesh/shared-types — keep in sync)
// ---------------------------------------------------------------------------

/** 17 life-event categories understood by the rectification scorer (Spec 062 E6 added family_rupture). */
export type LifeEventCategory =
  | 'marriage'
  | 'engagement'
  | 'breakup'
  | 'childbirth'
  | 'career_change'
  | 'promotion'
  | 'job_loss'
  | 'business_start'
  | 'relocation'
  | 'property_purchase'
  | 'windfall'
  | 'expense_shock'
  | 'health_issue'
  | 'surgery'
  | 'higher_studies'
  | 'litigation'
  | 'family_rupture';

/** Rectification computation mode. */
export type RectificationMode = 'cusp' | 'window';

/** Confidence band for the ranked result. */
export type RectificationBand = 'near_tie' | 'leans' | 'consistent';

/** How precisely the user knows an event's date (drives the engine's transit window). */
export type EventDatePrecision = 'exact' | 'month' | 'year' | 'approx';

/**
 * How much the recorded birth time anchors the E5 prior (Spec 062).
 * 'about' = weak triangular prior around the recorded time; 'unknown' = flat,
 * no prior. Engine defaults per mode: 'about' for cusp, 'unknown' for window.
 */
export type AnchorConfidence = 'about' | 'unknown';

/** One life event supplied to the rectification engine (camelCase, caller-side). */
export interface RectificationEventInputWire {
  readonly date: string; // ISO date "YYYY-MM-DD"
  readonly category: LifeEventCategory;
  // Optional on the wire: the Python glue defaults a missing value to "exact"
  // (matching the engine's `RectificationEventInput.precision` default), so older
  // callers stay byte-stable while precision-aware callers thread the real value.
  readonly precision?: EventDatePrecision;
}

// ---------------------------------------------------------------------------
// Caller-side input (camelCase; serialised to JSON for postMessage)
// ---------------------------------------------------------------------------

/** Input for the birth-time rectification engine (cusp or window mode). */
export interface RectificationInput {
  readonly datetimeUtc: string; // ISO-8601 UTC birth instant
  readonly latitude: number;
  readonly longitude: number;
  readonly utcOffsetMinutes: number; // local UTC offset in minutes (e.g. 330 for IST)
  readonly events: readonly RectificationEventInputWire[];
  readonly mode: RectificationMode; // 'cusp' | 'window'
  /**
   * Honest search-window bound in minutes around the recorded time (Spec 062):
   * bounds the WINDOW-mode scan (omit = full birth day; ignored in CUSP mode)
   * and widens the E5 anchor prior's half-width. Optional on the wire — the
   * Python glue omits the kwarg entirely when absent, keeping older callers
   * byte-stable.
   */
  readonly spanMinutes?: number;
  /**
   * E5 anchor-prior confidence (Spec 062). Optional: the engine defaults per
   * mode ('about' for cusp, 'unknown' for window), so an explicit
   * mode-matching value and an absent one are byte-identical.
   */
  readonly anchorConfidence?: AnchorConfidence;
  readonly referenceDate?: string; // ISO-8601; omit to use wall clock (non-deterministic)
}

// ---------------------------------------------------------------------------
// Wire shapes from Python model_dump(mode="json") — snake_case keys
// ---------------------------------------------------------------------------

// SIGNAL KEY GRAMMAR (Spec 062 — mirrored from the module docstring of
// backend/src/almamesh/rectification/scorer.py; keep the two in sync):
//
//   md_lord_rules_h{n} / md_lord_in_h{n}   maha-dasha lord rules/occupies house n (w 1.0)
//   ad_lord_rules_h{n} / ad_lord_in_h{n}   antar-dasha lord rules/occupies house n (w 0.7)
//   pd_lord_rules_h{n} / pd_lord_in_h{n}   pratyantar lord rules/occupies house n (w 0.5)
//   slow_transit_h{n}                      Jupiter/Saturn transits house n       (w 0.5)
//   d9_lord_rules_d9_h7                    active lord rules 7th-from-D9-lagna   (w 0.6)
//   d9_lord_in_d9_h7                       active lord occupies 7th-from-D9-lagna (w 0.6)
//   d9_lord_is_d9_lagna_lord               active lord rules the D9 lagna        (w 0.4)
//   …#afflicted_fit / …#dignified_fit      valence suffix: the firing lord's dignity
//                                          matches the event's character (x1.25);
//                                          a silent x0.85 damp applies to mismatches
//                                          (no suffix — never negative by itself)
//   prior_anchor                           pseudo-signal: the weak recorded-time prior
//                                          (rendered from candidate.prior_bonus)
//   miss_unexplained                       per-event: the event fired NOTHING for this
//                                          candidate (−0.25 per silent grid sample)
//   miss_silent_{category}_h{n}            candidate-level (candidate.misses): a strong
//                                          antar signature (lord rules AND occupies
//                                          house n) with no reported {category} event
//                                          inside the period (−0.15, ≤2 per category)

/**
 * Wire shape of EventEvidence (backend rectification/models.py).
 *
 * `contribution` is the NET per-event contribution (Spec 062) and CAN BE
 * NEGATIVE — a `miss_unexplained` row counts against the candidate.
 */
export interface EventEvidenceRaw {
  readonly event_index: number;
  readonly category: LifeEventCategory;
  readonly date: string;
  readonly signals: readonly string[];
  readonly contribution: number;
}

/**
 * Wire shape of RectificationCandidate (backend rectification/models.py).
 *
 * The Spec 062 fields (`navamsa_lagna_sign`, the fit-score split, `misses`)
 * are optional here because an OLDER bundled wheel may omit them; the store
 * adapter supplies the backend model defaults (null / 0 / []).
 * `fit_score = positive_total - penalty_total + prior_bonus`.
 */
export interface RectificationCandidateRaw {
  readonly ascendant_sign: string;
  readonly representative_time_local: string;
  readonly lagna_longitude_deg: number;
  readonly lagna_cusp_distance_deg: number;
  readonly is_near_cusp: boolean;
  readonly fit_score: number;
  readonly navamsa_lagna_sign?: string | null;
  readonly positive_total?: number;
  readonly penalty_total?: number;
  readonly prior_bonus?: number;
  readonly misses?: readonly string[];
  readonly supporting_events: readonly EventEvidenceRaw[];
}

/**
 * Wire shape of RectificationResult (backend rectification/models.py).
 *
 * `honesty_note_key` is `rectify.honesty.{band}` or a Spec 062 variant
 * `rectify.honesty.{band}.prior_influenced` / `.penalty_driven`.
 */
export interface RectificationResultRaw {
  readonly mode: RectificationMode;
  readonly candidates: readonly RectificationCandidateRaw[];
  readonly margin: number;
  readonly band: RectificationBand;
  readonly discriminating_event_count: number;
  readonly recorded_time_sign: string | null;
  readonly honesty_note_key: string;
}
