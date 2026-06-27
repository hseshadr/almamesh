/**
 * Rectification Store — transient (no persist middleware).
 *
 * Drives the birth-time rectification flow: idle -> loading -> ready | error.
 * The engine call is delegated to whatever runtime is passed (structurally
 * compatible with the `ChartEngine` returned by `AlmaMeshRuntime.bootstrap()`).
 * Raw results are adapted through the pure `adaptRectification` layer before
 * being stored — the store only holds `@almamesh/shared-types` shapes.
 */

import { create } from 'zustand';

import type { RectificationResult } from '@almamesh/shared-types';
import type { RectificationInput, RectificationResultRaw } from '@almamesh/browser/types';

import { adaptRectification } from './adapters/rectification';

/** The engine surface this store depends on; `ChartEngine` satisfies it structurally. */
export interface RectificationRuntime {
  computeRectification(input: RectificationInput): Promise<RectificationResultRaw>;
}

interface RectificationState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly result: RectificationResult | null;
  readonly error: string | null;
  /** Run rectification and transition through loading -> ready | error. */
  run(engine: RectificationRuntime, input: RectificationInput): Promise<void>;
  /** Reset to idle, clearing any previous result or error. */
  reset(): void;
}

export const useRectificationStore = create<RectificationState>()((set) => ({
  status: 'idle',
  result: null,
  error: null,

  async run(engine, input) {
    set({ status: 'loading', result: null, error: null });
    try {
      const raw = await engine.computeRectification(input);
      set({ status: 'ready', result: adaptRectification(raw), error: null });
    } catch (err) {
      set({
        status: 'error',
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  reset() {
    set({ status: 'idle', result: null, error: null });
  },
}));
