/**
 * useLagnaPreview — a debounced, NON-DESTRUCTIVE Ascendant (Lagna) preview.
 *
 * As the user adjusts the rectified birth time in Settings, this hook computes
 * the resulting lagna on the SHARED in-browser engine (the same `ChartEngine`
 * the dashboard + regeneration use — never a second Pyodide worker) and returns
 * just the sign + degree + nakshatra for display. It is preview-only: it does
 * NOT emit `birth-info-changed`, save a chart, or persist anything. It exists so
 * a user can SEE that a few minutes flips their rising sign before committing.
 */

import { useEffect, useState } from 'react';

import type { ChartEngine } from '@almamesh/browser';
import { type LocalBirthInput, toBirthInput } from '@almamesh/store';

/** The minimal lagna read-out the preview renders. */
export interface LagnaPreview {
  /** Engine Title-Case sign name, e.g. "Aquarius". */
  readonly sign: string;
  /** Degrees within the sign (0..30). */
  readonly signDegrees: number;
  /** Engine nakshatra name. */
  readonly nakshatra: string;
}

export type LagnaPreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly lagna: LagnaPreview }
  | { readonly status: 'error' }
  | { readonly status: 'unavailable' };

const DEBOUNCE_MS = 300;

/** Stable key over the inputs that change the lagna; re-runs only when it moves. */
function previewKey(input: LocalBirthInput | null): string {
  if (input === null) {
    return '';
  }
  const clock = input.rectifiedTime ?? input.time;
  return `${input.date}T${clock}|${input.timezone}|${input.latitude}|${input.longitude}`;
}

/**
 * Debounce `input` ~300ms and compute its lagna on `engine`. Returns the current
 * preview state. Passing `input: null` (incomplete form) yields `idle`; a null
 * engine that has not errored yields `unavailable`.
 */
export function useLagnaPreview(
  engine: ChartEngine | null,
  engineError: Error | null,
  input: LocalBirthInput | null,
): LagnaPreviewState {
  const [state, setState] = useState<LagnaPreviewState>({ status: 'idle' });
  const key = previewKey(input);

  useEffect(() => {
    if (input === null || key === '') {
      setState({ status: 'idle' });
      return;
    }
    if (engineError !== null || engine === null) {
      setState({ status: 'unavailable' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const chart = await engine.generateChart(toBirthInput(input));
          if (cancelled) {
            return;
          }
          setState({
            status: 'ready',
            lagna: {
              sign: chart.lagna.sign,
              signDegrees: chart.lagna.sign_degrees,
              nakshatra: chart.lagna.nakshatra,
            },
          });
        } catch {
          if (!cancelled) {
            setState({ status: 'error' });
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` collapses the lagna-affecting inputs into one dependency; `input`
    // is read inside but intentionally excluded so a new object identity with
    // the same values does not re-run the engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, engineError, key]);

  return state;
}
