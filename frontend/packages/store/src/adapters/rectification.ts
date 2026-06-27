// Pure translation layer for the engine's rectification result
// (`@almamesh/browser` raw snake_case shapes -> `@almamesh/shared-types` UI shapes).
//
// Per the project rule, this RESHAPES AND RENAMES ONLY — no astrology is
// computed in TypeScript. Every number, string, and flag is verbatim; only
// the naming convention changes (snake_case -> camelCase).

import type {
  EventEvidence,
  RectificationCandidate,
  RectificationResult,
} from '@almamesh/shared-types';
import type {
  EventEvidenceRaw,
  RectificationCandidateRaw,
  RectificationResultRaw,
} from '@almamesh/browser/types';

function adaptEvidence(raw: EventEvidenceRaw): EventEvidence {
  return {
    eventIndex: raw.event_index,
    category: raw.category,
    date: raw.date,
    signals: raw.signals,
    contribution: raw.contribution,
  };
}

function adaptCandidate(raw: RectificationCandidateRaw): RectificationCandidate {
  return {
    ascendantSign: raw.ascendant_sign,
    representativeTimeLocal: raw.representative_time_local,
    lagnaLongitudeDeg: raw.lagna_longitude_deg,
    lagnaCuspDistanceDeg: raw.lagna_cusp_distance_deg,
    isNearCusp: raw.is_near_cusp,
    fitScore: raw.fit_score,
    supportingEvents: raw.supporting_events.map(adaptEvidence),
  };
}

/** Reshape the raw snake_case rectification result into the UI-facing camelCase contract. */
export function adaptRectification(raw: RectificationResultRaw): RectificationResult {
  return {
    mode: raw.mode,
    candidates: raw.candidates.map(adaptCandidate),
    margin: raw.margin,
    band: raw.band,
    discriminatingEventCount: raw.discriminating_event_count,
    recordedTimeSign: raw.recorded_time_sign,
    honestyNoteKey: raw.honesty_note_key,
  };
}
