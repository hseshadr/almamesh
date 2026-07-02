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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useStreamingInterpretation } from '../useStreamingInterpretation';

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
  streamStructuredInterpretation,
  PrivacyViolationError,
  LlmRequestError,
  type InterpretationEvent,
} from '@almamesh/llm';
import { useInterpretationStore, useLanguageStore } from '@almamesh/store';
import type { VedicInterpretation } from '@almamesh/shared-types';

const mockedStream = vi.mocked(streamStructuredInterpretation);

// A chart that carries the raw engine output the sanitizer needs.
const CHART_WITH_RAW = {
  chart_id: 'chart-123',
  sidereal_chart: { ayanamsa_value: 23.4, lagna: {}, planets: {}, houses: {}, yogas: [] },
};

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
    vi.clearAllMocks();
    getChart.mockReturnValue(CHART_WITH_RAW);
    // Reset any persisted interpretation between tests.
    useInterpretationStore.setState({ byChart: {} });
    // Reset the language preference to the English default for each test.
    useLanguageStore.setState({ language: 'en' });
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

  it('surfaces a friendly notice when the endpoint is unreachable', async () => {
    mockedStream.mockImplementation(failingStream(new LlmRequestError('LLM endpoint returned 0')));

    const { result } = renderHook(() => useStreamingInterpretation('chart-123'));
    await act(async () => {
      await result.current.streamInterpretation('chart-123');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/Configure a local or OpenRouter model/);
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
