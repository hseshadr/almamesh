/**
 * Tests for useStreamingInterpretation hook — local-first, structured in-browser.
 *
 * The hook now drives @almamesh/llm's structured generator
 * (`streamStructuredInterpretation`) and mirrors its event stream into the
 * persisted `useInterpretationStore`. These tests assert the store-backed state
 * machine (idle -> generating -> complete/error), per-section progress, the
 * finished interpretation, the friendly fallback when no model is reachable, and
 * the fail-closed privacy surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import {
  READING_MODEL_UNAVAILABLE,
  resolveInterpretationConfig,
  useStreamingInterpretation,
} from '../useStreamingInterpretation';

// Mock the local LLM package: we drive the structured event stream + errors.
vi.mock('@almamesh/llm', async () => {
  const actual = await vi.importActual<typeof import('@almamesh/llm')>('@almamesh/llm');
  return {
    ...actual,
    streamStructuredInterpretation: vi.fn(),
  };
});

// Mock the chart-library store so the hook can resolve a chart by id; the
// interpretation store is the REAL store (in-memory under vitest, no localStorage).
const getChart = vi.fn();
vi.mock('@almamesh/store', async () => {
  const actual = await vi.importActual<typeof import('@almamesh/store')>('@almamesh/store');
  return {
    ...actual,
    useChartLibraryStore: { getState: () => ({ getChart }) },
  };
});

import {
  configProvenance,
  streamStructuredInterpretation,
  PrivacyViolationError,
  LlmRequestError,
  type InterpretationEvent,
} from '@almamesh/llm';
import {
  predictiveRequestKey,
  useInterpretationStore,
  useLanguageStore,
  usePredictiveStore,
  useProfilesStore,
} from '@almamesh/store';
import type { VedicInterpretation } from '@almamesh/shared-types';

const mockedStream = vi.mocked(streamStructuredInterpretation);

// A chart that carries the raw engine output the sanitizer needs.
const CHART_WITH_RAW = {
  chart_id: 'chart-123',
  profile_id: 'profile-123',
  birth_data: {
    birth_datetime_utc: '1990-03-30T06:45:00Z',
    birth_location_details: { latitude: 12.97, longitude: 77.59 },
  },
  sidereal_chart: { ayanamsa_value: 23.4, lagna: {}, planets: {}, houses: {}, yogas: [] },
};

const CURRENT_PREDICTIVE_KEY = predictiveRequestKey({
  profileKey: 'profile-123',
  datetimeUtc: '1990-03-30T06:45:00Z',
  latitude: 12.97,
  longitude: 77.59,
  referenceInstant: '2026-07-12T00:00:00Z',
});

const SAMPLE_INTERPRETATION: VedicInterpretation = {
  summary: { layman: 'A grounded soul.', technical: 'A grounded soul.' },
  strengths: [],
  challenges: [],
  life_themes: [],
  integrated_yoga_narrative: { layman: '', technical: '' },
  health_guidance: null,
  education_guidance: null,
  career_guidance: { layman: 'You build steadily.', technical: '' },
  relationship_guidance: null,
  finances_guidance: null,
  spiritual_guidance: null,
  life_evolution_guidance: null,
  remedial_measures: null,
};

function eventStream(events: InterpretationEvent[]): () => AsyncGenerator<InterpretationEvent> {
  return async function* () {
    for (const e of events) yield e;
  };
}

// A stream that throws a fatal error before any event. The empty-array loop
// keeps a real `yield` in the generator body (the streaming contract) while
// guaranteeing the error is thrown before any event reaches the hook.
function failingStream(error: Error): () => AsyncGenerator<InterpretationEvent> {
  return async function* () {
    for (const e of [] as InterpretationEvent[]) yield e;
    throw error;
  };
}

describe('useStreamingInterpretation (structured, store-backed)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    vi.clearAllMocks();
    getChart.mockReturnValue(CHART_WITH_RAW);
    // Deterministic LLM settings: no browser-local overrides between tests.
    localStorage.clear();
    // Reset any persisted interpretation between tests.
    useInterpretationStore.setState({ byChart: {} });
    // Reset the language preference to the English default for each test.
    useLanguageStore.setState({ language: 'en' });
    useProfilesStore.setState({ activeProfileId: 'profile-123' });
    usePredictiveStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle with no interpretation or error', () => {
    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    expect(result.current.status).toBe('idle');
    expect(result.current.interpretation).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.sections).toHaveLength(5);
  });

  it('marks sections complete and stores the finished interpretation', async () => {
    mockedStream.mockImplementation(
      eventStream([
        { type: 'section_complete', section: 'core' },
        { type: 'section_complete', section: 'guidance1' },
        { type: 'complete', interpretation: SAMPLE_INTERPRETATION },
      ]),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123', { view_mode: 'layman' });
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.interpretation).toEqual(SAMPLE_INTERPRETATION);
    const byKey = Object.fromEntries(result.current.sections.map((s) => [s.key, s.complete]));
    expect(byKey.core).toBe(true);
    expect(byKey.guidance1).toBe(true);
    expect(byKey.remedial).toBe(false);
  });

  it('records per-section error events as failed sections (partial success stays complete)', async () => {
    // The generator degrades a failed section to empty and still completes —
    // the hook must record the failure instead of discarding the event.
    mockedStream.mockImplementation(
      eventStream([
        { type: 'section_complete', section: 'core' },
        { type: 'error', section: 'yoga', message: 'HTTP 500 from endpoint' },
        { type: 'section_complete', section: 'guidance1' },
        { type: 'section_complete', section: 'guidance2' },
        { type: 'section_complete', section: 'remedial' },
        { type: 'complete', interpretation: SAMPLE_INTERPRETATION },
      ]),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.interpretation).toEqual(SAMPLE_INTERPRETATION);
    const byKey = Object.fromEntries(result.current.sections.map((s) => [s.key, s]));
    expect(byKey.yoga?.failed).toBe(true);
    expect(byKey.yoga?.complete).toBe(false);
    expect(byKey.core?.failed).toBe(false);
    expect(result.current.failedSections).toEqual(['yoga']);
  });

  it('clears failed sections when a new generation starts', async () => {
    mockedStream.mockImplementation(
      eventStream([
        { type: 'error', section: 'yoga', message: 'boom' },
        { type: 'section_complete', section: 'core' },
        { type: 'complete', interpretation: SAMPLE_INTERPRETATION },
      ]),
    );
    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });
    await waitFor(() => expect(result.current.failedSections).toEqual(['yoga']));

    // Regenerate with a fully-successful stream: the failure must not linger.
    mockedStream.mockImplementation(
      eventStream([
        { type: 'section_complete', section: 'yoga' },
        { type: 'complete', interpretation: SAMPLE_INTERPRETATION },
      ]),
    );
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });
    await waitFor(() => expect(result.current.failedSections).toEqual([]));
  });

  it('passes the raw chart and resolved mode to the generator', async () => {
    mockedStream.mockImplementation(
      eventStream([{ type: 'complete', interpretation: SAMPLE_INTERPRETATION }]),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123', { view_mode: 'expert' });
    });

    expect(mockedStream).toHaveBeenCalledTimes(1);
    const arg = mockedStream.mock.calls[0][0];
    expect(arg.chart).toBe(CHART_WITH_RAW.sidereal_chart);
    expect(arg.mode).toBe('expert');
  });

  it('defaults to English when no language is chosen', async () => {
    mockedStream.mockImplementation(
      eventStream([{ type: 'complete', interpretation: SAMPLE_INTERPRETATION }]),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123', { view_mode: 'layman' });
    });

    expect(mockedStream).toHaveBeenCalledTimes(1);
    expect(mockedStream.mock.calls[0][0].language).toBe('en');
  });

  it('passes the persisted UI language into the generator', async () => {
    useLanguageStore.setState({ language: 'es' });
    mockedStream.mockImplementation(
      eventStream([{ type: 'complete', interpretation: SAMPLE_INTERPRETATION }]),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123', { view_mode: 'layman' });
    });

    expect(mockedStream).toHaveBeenCalledTimes(1);
    expect(mockedStream.mock.calls[0][0].language).toBe('es');
  });

  it('maps a request failure to friendly retry copy — never env-var names or endpoints', async () => {
    mockedStream.mockImplementation(failingStream(new LlmRequestError('LLM endpoint returned 0')));

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    // The same actionable classification the chat path uses — never the old
    // developer-facing "set VITE_LLM_API_BASE / localhost:11434" notice.
    expect(result.current.error).toMatch(/try again in a moment/i);
    expect(result.current.error).not.toMatch(/VITE_/);
    expect(result.current.error).not.toMatch(/localhost/);
  });

  it('maps an unreachable endpoint (fetch TypeError) to "check AI settings" copy', async () => {
    mockedStream.mockImplementation(failingStream(new TypeError('Failed to fetch')));

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/couldn.t reach your ai endpoint/i);
  });

  it('REGRESSION: a bare non-network TypeError (a code bug) is NOT mislabeled "endpoint unreachable"', async () => {
    // A TypeError that is NOT a fetch failure — e.g. a genuine bug in the
    // reading pipeline — used to short-circuit to the unreachable-endpoint copy
    // (`err instanceof TypeError` alone), sending the user to check an endpoint
    // that was never the problem. It must now fall through to the generic
    // "try again / check settings" message (and be console.error-logged raw).
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bug = new TypeError("Cannot read properties of undefined (reading 'sections')");
    mockedStream.mockImplementation(failingStream(bug));

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).not.toMatch(/couldn.t reach your ai endpoint/i);
    expect(result.current.error).toMatch(/try again in a moment/i);
    // The raw error is logged for developers even though the user sees friendly copy.
    expect(errSpy).toHaveBeenCalledWith('[interpretation] reading stream failed:', bug);
    errSpy.mockRestore();
  });

  it('REGRESSION: a failure whose message embeds the endpoint URL surfaces friendly copy, never the URL', async () => {
    // The all-sections-failed aggregate is a plain Error whose message can
    // carry the configured VITE_LLM_API_BASE endpoint — it must never render.
    mockedStream.mockImplementation(
      failingStream(
        new Error(
          'Interpretation failed: all 5 sections failed. ' +
            'LLM request to https://openrouter.example/api/v1/chat/completions failed (HTTP 401)',
        ),
      ),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).not.toContain('https://');
    expect(result.current.error).not.toContain('openrouter.example');
    expect(result.current.error).toMatch(/settings/i);
  });

  it('maps an aggregate of per-section network failures to the unreachable-endpoint copy', async () => {
    mockedStream.mockImplementation(
      failingStream(
        new Error('Interpretation failed: all 5 sections failed. Failed to fetch; Failed to fetch'),
      ),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/couldn.t reach your ai endpoint/i);
  });

  it('maps a dead/retired model to the stable model-unavailable sentinel (switch-model prompt)', async () => {
    mockedStream.mockImplementation(
      failingStream(
        new LlmRequestError('HTTP 404: No endpoints found for test-org/retired-model', {
          status: 404,
        }),
      ),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    // The sentinel — the dashboard maps it to the switch-model prompt, and the
    // raw "No endpoints found" body never reaches the screen.
    expect(result.current.error).toBe(READING_MODEL_UNAVAILABLE);
  });

  it('maps an exhausted-credits 402 to billing copy, never "check your model" advice', async () => {
    // REGRESSION (live repro 2026-07-03): a real OpenRouter key on an account
    // with usage ≥ credits gets HTTP 402 on every section. The old generic
    // copy ("check your model and endpoint… try again") sent the user in
    // circles — retrying can never fix a billing problem.
    mockedStream.mockImplementation(
      failingStream(
        new LlmRequestError(
          'LLM endpoint returned 402 Payment Required: {"error":{"message":"Insufficient credits. Add more using https://openrouter.ai/settings/credits","code":402}}',
          { status: 402 },
        ),
      ),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/credit/i);
    expect(result.current.error).not.toMatch(/check your model/i);
    expect(result.current.error).not.toContain('https://');
  });

  it('maps an insufficient-credits aggregate (no typed status) to the same billing copy', async () => {
    mockedStream.mockImplementation(
      failingStream(
        new Error(
          'Interpretation failed: all 6 sections failed. LLM endpoint returned 402 Payment Required: Insufficient credits',
        ),
      ),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/credit/i);
  });

  it('surfaces the privacy violation message verbatim (fail-closed)', async () => {
    mockedStream.mockImplementation(
      failingStream(new PrivacyViolationError('refusing to send chart data to non-local endpoint')),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/refusing to send/);
  });

  it('errors gracefully when the chart has no raw engine output', async () => {
    getChart.mockReturnValue({ chart_id: 'chart-123' }); // no sidereal_chart

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/regenerated/);
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it('records the resolved config identity as the reading provenance on completion', async () => {
    mockedStream.mockImplementation(
      eventStream([{ type: 'complete', interpretation: SAMPLE_INTERPRETATION }]),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
    const entry = useInterpretationStore.getState().getEntry('chart-123');
    // The provenance is the display identity of the SAME resolved config the
    // hook streamed with — so the UI can caption the reading with its model
    // and a later config change is detectable as a mismatch.
    expect(entry?.provenance).toEqual(configProvenance(resolveInterpretationConfig()));
    expect(entry?.provenance?.model).toBeTruthy();
    // Never a secret: the persisted object has exactly the identity fields.
    expect(Object.keys(entry?.provenance ?? {}).sort()).toEqual(
      Object.keys(configProvenance(resolveInterpretationConfig())).sort(),
    );
  });

  it('records the exact predictive request key when predictive facts were narrated', async () => {
    usePredictiveStore.setState({
      status: 'ready',
      profileKey: 'profile-123',
      requestKey: CURRENT_PREDICTIVE_KEY,
      rawContexts: {
        transit_context: { instant: '2026-07-12T00:00:00Z' },
        varga_context_full: { charts: {} },
        strength_context: {},
        domains_context: { forecasts: {} },
      },
    } as never);
    mockedStream.mockImplementation(
      eventStream([{ type: 'complete', interpretation: SAMPLE_INTERPRETATION }]),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    expect(useInterpretationStore.getState().getEntry('chart-123')?.inputProvenance).toEqual({
      predictiveRequestKey: CURRENT_PREDICTIVE_KEY,
    });
  });

  it('records explicit natal-only provenance when no matching predictive facts were narrated', async () => {
    mockedStream.mockImplementation(
      eventStream([{ type: 'complete', interpretation: SAMPLE_INTERPRETATION }]),
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    expect(useInterpretationStore.getState().getEntry('chart-123')?.inputProvenance).toEqual({
      predictiveRequestKey: null,
    });
  });

  it('never exposes a predictive reading after its request key changes', () => {
    useInterpretationStore.getState().setInterpretation(
      'chart-123',
      SAMPLE_INTERPRETATION,
      '2026-07-11T00:00:00Z',
      configProvenance(resolveInterpretationConfig()),
      { predictiveRequestKey: '["profile-123","stale-birth","2026-07-11"]' },
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));

    expect(result.current.status).toBe('idle');
    expect(result.current.interpretation).toBeUndefined();
  });

  it('never exposes a legacy reading whose predictive input is unknown', () => {
    useInterpretationStore
      .getState()
      .setInterpretation(
        'chart-123',
        SAMPLE_INTERPRETATION,
        '2026-07-11T00:00:00Z',
        configProvenance(resolveInterpretationConfig()),
      );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));

    expect(result.current.status).toBe('idle');
    expect(result.current.interpretation).toBeUndefined();
  });

  it('keeps an explicitly natal-only reading reusable across predictive day changes', () => {
    useInterpretationStore.getState().setInterpretation(
      'chart-123',
      SAMPLE_INTERPRETATION,
      '2026-07-11T00:00:00Z',
      configProvenance(resolveInterpretationConfig()),
      { predictiveRequestKey: null },
    );

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));

    expect(result.current.status).toBe('complete');
    expect(result.current.interpretation).toEqual(SAMPLE_INTERPRETATION);
  });

  it('keeps the previously completed reading when a regeneration fails', async () => {
    mockedStream.mockImplementation(
      eventStream([{ type: 'complete', interpretation: SAMPLE_INTERPRETATION }]),
    );
    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });
    await waitFor(() => expect(result.current.status).toBe('complete'));

    // The regeneration fails outright — the old reading must survive.
    mockedStream.mockImplementation(failingStream(new LlmRequestError('HTTP 500')));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.interpretation).toEqual(SAMPLE_INTERPRETATION);
  });

  it('reset clears the entry back to idle', async () => {
    mockedStream.mockImplementation(
      eventStream([{ type: 'complete', interpretation: SAMPLE_INTERPRETATION }]),
    );
    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });
    await waitFor(() => expect(result.current.status).toBe('complete'));
    act(() => result.current.reset());
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.interpretation).toBeUndefined();
  });
});
