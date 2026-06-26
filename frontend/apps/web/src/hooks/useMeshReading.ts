/**
 * useMeshReading — drives `@almamesh/llm`'s three-section mesh edge reading
 * (connection / timing together / care) from the edge view.
 *
 * Mirrors the dashboard's interpretation wiring: the model env comes from the
 * persisted LLM settings via `applyInterpretationSettings` (the explicit
 * interpretation tier — a strong/frontier model; chat keeps its own fast-model
 * tier elsewhere), the narration language follows the UI language store, and the
 * voice mode follows the global content mode. The generation NEVER auto-starts;
 * `generate()` is an explicit human action.
 *
 * The reading is page-local state (not persisted): edges re-derive in seconds
 * and the narration is regenerable on demand.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useContentModeStore, useLanguageStore } from '@almamesh/store';
import type { MeshEdgeCtx } from '@almamesh/shared-types';
import {
  applyInterpretationSettings,
  resolveProviderConfig,
  streamMeshReading,
  type LlmEnv,
  type MeshEdgeContext as LlmMeshEdgeContext,
  type MeshReading,
  type MeshReadingSectionKey,
} from '@almamesh/llm';

export type MeshReadingStatus = 'idle' | 'streaming' | 'complete' | 'error';

export interface MeshReadingLayer {
  readonly status: MeshReadingStatus;
  readonly reading?: MeshReading;
  readonly error?: string;
  /** Sections that finished (drives the honest per-section checklist). */
  readonly completed: ReadonlySet<MeshReadingSectionKey>;
  /** Explicitly start (or restart) the narration. No-op while streaming. */
  readonly generate: () => void;
}

/** The persisted LLM settings as a provider env (interpretation-grade model). */
function readMeshLlmEnv(): LlmEnv {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return applyInterpretationSettings({
    VITE_LLM_API_BASE: env.VITE_LLM_API_BASE,
    VITE_LLM_API_KEY: env.VITE_LLM_API_KEY,
    VITE_LLM_MODEL: env.VITE_LLM_MODEL,
    VITE_LLM_PRIVACY_MODE: env.VITE_LLM_PRIVACY_MODE,
    VITE_LLM_ENGINE: env.VITE_LLM_ENGINE,
  });
}

interface ReadingState {
  readonly status: MeshReadingStatus;
  readonly reading?: MeshReading;
  readonly error?: string;
  readonly completed: ReadonlySet<MeshReadingSectionKey>;
}

const IDLE_STATE: ReadingState = { status: 'idle', completed: new Set() };

export function useMeshReading(edge: MeshEdgeCtx | undefined): MeshReadingLayer {
  const [state, setState] = useState<ReadingState>(IDLE_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const contentMode = useContentModeStore((s) => s.contentMode);

  // A new edge (window/roles recomputed, member switched) resets the narration
  // — the old text described different facts. In-flight requests are aborted.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE_STATE);
    return () => {
      abortRef.current?.abort();
    };
  }, [edge]);

  const generate = useCallback(() => {
    if (!edge) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'streaming', completed: new Set() });

    // The UI edge mirrors the engine's serialized MeshEdgeContext shape; the
    // llm package types the same wire shape locally (structural by design).
    const llmEdge: LlmMeshEdgeContext = edge;
    const run = async (): Promise<void> => {
      const events = streamMeshReading({
        edge: llmEdge,
        config: resolveProviderConfig(readMeshLlmEnv()),
        relationship: edge.relationship,
        mode: contentMode === 'technical' ? 'expert' : 'layman',
        language: useLanguageStore.getState().language,
        signal: controller.signal,
      });
      for await (const event of events) {
        if (controller.signal.aborted) {
          return;
        }
        if (event.type === 'section_complete') {
          setState((prev) => ({
            ...prev,
            completed: new Set([...prev.completed, event.section]),
          }));
        } else if (event.type === 'complete') {
          setState((prev) => ({ ...prev, status: 'complete', reading: event.reading }));
        }
        // Per-section errors degrade quietly (the merged reading still lands);
        // an all-sections failure throws and is caught below.
      }
    };
    run().catch((err: unknown) => {
      if (controller.signal.aborted) {
        return;
      }
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    });
  }, [edge, contentMode]);

  return { ...state, generate };
}
