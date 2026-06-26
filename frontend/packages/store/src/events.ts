/**
 * App-wide typed event bus (`mitt`).
 *
 * The single channel through which "the user changed birth info" flows. Both
 * Onboarding and Settings EMIT `birth-info-changed`; exactly one subscriber
 * (wired in `App.tsx`) runs the regeneration handler. This breaks the prior
 * duplication where each page inlined its own regen sequence and drifted —
 * orphaning charts, dropping `profile_id`, and skipping change-detection.
 */

import mitt, { type Emitter } from 'mitt';

import type { BirthMeta } from './adapters/chart';

/** Payload emitted whenever the user commits new/edited birth information. */
export interface BirthInfoChanged {
  readonly birth: BirthMeta;
  /** The owning profile, or null when no profile is active yet (first run). */
  readonly profileId: string | null;
}

/**
 * The typed event map for the app bus. A `type` alias (not an interface) is
 * required here: mitt's `Emitter<Events extends Record<EventType, unknown>>`
 * generic is only satisfied structurally by an object type literal, not by a
 * named interface (which lacks the implicit symbol index signature).
 */
export type AppEvents = {
  'birth-info-changed': BirthInfoChanged;
};

/** The shared app event bus. Import and `emit`/`on` the typed events above. */
export const appEvents: Emitter<AppEvents> = mitt<AppEvents>();
