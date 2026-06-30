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

/** 16 life-event categories understood by the rectification scorer. */
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
  | 'litigation';

/** Rectification computation mode. */
export type RectificationMode = 'cusp' | 'window';

/** Confidence band for the ranked result. */
export type RectificationBand = 'near_tie' | 'leans' | 'consistent';

/** How precisely the user knows an event's date (drives the engine's transit window). */
export type EventDatePrecision = 'exact' | 'month' | 'year' | 'approx';

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
  readonly referenceDate?: string; // ISO-8601; omit to use wall clock (non-deterministic)
}

// ---------------------------------------------------------------------------
// Wire shapes from Python model_dump(mode="json") — snake_case keys
// ---------------------------------------------------------------------------

/** Wire shape of EventEvidence (backend rectification/models.py). */
export interface EventEvidenceRaw {
  readonly event_index: number;
  readonly category: LifeEventCategory;
  readonly date: string;
  readonly signals: readonly string[];
  readonly contribution: number;
}

/** Wire shape of RectificationCandidate (backend rectification/models.py). */
export interface RectificationCandidateRaw {
  readonly ascendant_sign: string;
  readonly representative_time_local: string;
  readonly lagna_longitude_deg: number;
  readonly lagna_cusp_distance_deg: number;
  readonly is_near_cusp: boolean;
  readonly fit_score: number;
  readonly supporting_events: readonly EventEvidenceRaw[];
}

/** Wire shape of RectificationResult (backend rectification/models.py). */
export interface RectificationResultRaw {
  readonly mode: RectificationMode;
  readonly candidates: readonly RectificationCandidateRaw[];
  readonly margin: number;
  readonly band: RectificationBand;
  readonly discriminating_event_count: number;
  readonly recorded_time_sign: string | null;
  readonly honesty_note_key: string;
}
