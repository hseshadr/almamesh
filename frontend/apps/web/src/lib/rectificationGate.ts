/**
 * Rectification gate — a minimal Zustand flag that prevents
 * `usePredictiveLayer({ auto: true })` from auto-starting a new ~30s predictive
 * job while the rectification wizard is mounted, keeping the single serial
 * Pyodide worker free for the interactive rectification engine call.
 *
 * A Zustand store (not a module-level variable) so tests can reset state cleanly
 * via `setState` between runs, and React components can subscribe reactively.
 */

import { create } from 'zustand';

interface RectificationGateState {
  /** True while the useRectification hook is mounted (wizard is open). */
  readonly active: boolean;
  setActive: (active: boolean) => void;
}

export const useRectificationGate = create<RectificationGateState>()((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
