/**
 * Tests for the "Reset chart / start fresh" coordinator and the per-store
 * `clearAll` actions it composes.
 *
 * Reset semantics under test:
 *  - CLEARED: chart library + the `almamesh-chart` route-guard flag, profiles,
 *    life events, chat history, interpretations, in-memory mesh edges.
 *  - PRESERVED: the device preference keys `almamesh-language` and
 *    `almamesh-llm-settings`, and the OPFS engine bundle (never touched — we
 *    assert `navigator.storage.getDirectory` is never called).
 *
 * All fixtures are synthetic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VedicInterpretation } from '@almamesh/shared-types';
import {
  CHART_LIBRARY_FLAG_KEY,
  setActiveProfileScope,
  useChartLibraryStore,
  useChatStore,
  useInterpretationStore,
  useLifeEventsStore,
  useMeshStore,
  useProfilesStore,
  type StoredChart,
} from '@almamesh/store';

import { resetEverything } from './resetEverything';

const LANGUAGE_KEY = 'almamesh-language';
const LLM_SETTINGS_KEY = 'almamesh-llm-settings';
const INTERPRETATIONS_KEY = 'almamesh-interpretations';

/** A minimal synthetic chart — only the fields the library store reads. */
function makeChart(chartId: string): StoredChart {
  return {
    chart_id: chartId,
    person_name: 'Test Native',
    is_primary: true,
  } as unknown as StoredChart;
}

/** A minimal valid `VedicInterpretation` (mirrors interpretation.test.ts). */
function makeInterpretation(): VedicInterpretation {
  return {
    summary: { layman: 'A bright year.', technical: 'Jupiter strong.' },
    strengths: [],
    challenges: [],
    life_themes: [],
  };
}

/** Seed every owned store + the preserved/erased localStorage keys. */
function seedEverything(): { profileId: string; chartId: string } {
  const profileId = useProfilesStore.getState().createProfile('Alice');
  const chartId = 'chart-1';
  useChartLibraryStore.getState().saveChart(makeChart(chartId));
  useLifeEventsStore
    .getState()
    .addEvent(profileId, { description: 'Married', date: '2010-06-01' });
  const threadId = useChatStore.getState().ensureThread(profileId, chartId);
  useChatStore.getState().appendMessage(threadId, 'user', 'Tell me about my chart');
  useInterpretationStore
    .getState()
    .setInterpretation(chartId, makeInterpretation(), '2026-06-29T00:00:00.000Z');
  useMeshStore.setState({ edges: { [`${profileId}|other`]: { status: 'idle' } } });
  return { profileId, chartId };
}

beforeEach(() => {
  // Clean slate WITHOUT exercising the code under test.
  localStorage.clear();
  setActiveProfileScope(null);
  useChartLibraryStore.setState({ charts: {} });
  useProfilesStore.setState({ profiles: {}, activeProfileId: null });
  useLifeEventsStore.setState({ eventsByProfile: {} });
  useChatStore.setState({ threads: {}, messages: {} });
  useInterpretationStore.setState({ byChart: {} });
  useMeshStore.setState({ edges: {} });
});

describe('store clearAll actions', () => {
  it('chartLibrary.clearAll empties charts and removes the route-guard flag', () => {
    useChartLibraryStore.getState().saveChart(makeChart('c1'));
    expect(localStorage.getItem(CHART_LIBRARY_FLAG_KEY)).toBe('1');

    useChartLibraryStore.getState().clearAll();

    expect(useChartLibraryStore.getState().listAllCharts()).toEqual([]);
    expect(localStorage.getItem(CHART_LIBRARY_FLAG_KEY)).toBeNull();
  });

  it('profiles.clearAll empties profiles and resets active focus + scope', () => {
    const id = useProfilesStore.getState().createProfile('Bob');
    expect(useProfilesStore.getState().listProfiles()).toHaveLength(1);

    useProfilesStore.getState().clearAll();

    expect(useProfilesStore.getState().listProfiles()).toEqual([]);
    expect(useProfilesStore.getState().activeProfileId).toBeNull();
    void id;
  });

  it('lifeEvents.clearAll empties every profile bucket', () => {
    useLifeEventsStore.getState().addEvent('p1', { description: 'Moved', date: '2015-01-01' });
    expect(useLifeEventsStore.getState().getEvents('p1')).toHaveLength(1);

    useLifeEventsStore.getState().clearAll();

    expect(useLifeEventsStore.getState().eventsByProfile).toEqual({});
  });

  it('chat.clearAll empties threads and messages', () => {
    const threadId = useChatStore.getState().ensureThread('p1');
    useChatStore.getState().appendMessage(threadId, 'user', 'hi');
    expect(useChatStore.getState().listThreads('p1')).toHaveLength(1);

    useChatStore.getState().clearAll();

    expect(useChatStore.getState().threads).toEqual({});
    expect(useChatStore.getState().messages).toEqual({});
  });

  it('interpretation.clearAll empties every chart entry', () => {
    useInterpretationStore
      .getState()
      .setInterpretation('c1', makeInterpretation(), '2026-06-29T00:00:00.000Z');
    expect(useInterpretationStore.getState().getEntry('c1')).toBeDefined();

    useInterpretationStore.getState().clearAll();

    expect(useInterpretationStore.getState().byChart).toEqual({});
  });
});

describe('resetEverything', () => {
  it('clears every owned store and the chart flag, preserving device prefs', async () => {
    localStorage.setItem(LANGUAGE_KEY, JSON.stringify({ state: { language: 'es' }, version: 0 }));
    localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify({ endpoint: 'https://example' }));
    const { profileId, chartId } = seedEverything();

    expect(localStorage.getItem(CHART_LIBRARY_FLAG_KEY)).toBe('1');
    expect(localStorage.getItem(INTERPRETATIONS_KEY)).not.toBeNull();

    await resetEverything();

    // Cleared:
    expect(useChartLibraryStore.getState().listAllCharts()).toEqual([]);
    expect(useProfilesStore.getState().listProfiles()).toEqual([]);
    expect(useLifeEventsStore.getState().getEvents(profileId)).toEqual([]);
    expect(useChatStore.getState().threads).toEqual({});
    expect(useInterpretationStore.getState().getEntry(chartId)).toBeUndefined();
    expect(useMeshStore.getState().edges).toEqual({});
    expect(localStorage.getItem(CHART_LIBRARY_FLAG_KEY)).toBeNull();
    expect(localStorage.getItem(INTERPRETATIONS_KEY)).toBeNull();

    // Preserved:
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe(
      JSON.stringify({ state: { language: 'es' }, version: 0 }),
    );
    expect(localStorage.getItem(LLM_SETTINGS_KEY)).toBe(
      JSON.stringify({ endpoint: 'https://example' }),
    );
  });

  it('never touches the OPFS engine bundle', async () => {
    const getDirectory = vi.fn();
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory },
      configurable: true,
    });
    seedEverything();

    await resetEverything();

    expect(getDirectory).not.toHaveBeenCalled();
  });

  it('resolves cleanly so the caller can then navigate', async () => {
    await expect(resetEverything()).resolves.toBeUndefined();
  });
});
