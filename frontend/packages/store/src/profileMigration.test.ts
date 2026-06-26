import { beforeEach, describe, expect, it } from 'vitest';

import { useChartLibraryStore, setActiveProfileScope, type StoredChart } from './chartLibrary';
import { useChatStore, setActiveChatScope } from './chat';
import { runProfileMigration, useProfilesStore } from './profiles';

// No IndexedDB in the test runtime, so both stores run in-memory and hydration
// resolves immediately — exactly the SSR/test path. We reset both singletons
// between cases since they are module-level.

function installLocalStorage(): void {
  const backing = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

function makeChart(id: string, primary: boolean, profileId?: string): StoredChart {
  return {
    chart_id: id,
    person_name: `Person ${id}`,
    is_primary: primary,
    profile_id: profileId,
    astronomical_calculations: {
      sidereal_ctx: {
        julian_day: 0,
        ayanamsa_value: 24,
        ayanamsa_type: 'lahiri',
        house_system: 'whole_sign',
        sidereal_time: 0,
        lagna: {},
        planets: {},
      },
      calculation_timestamp: '1970-01-01T00:00:00.000Z',
      software_version: 'test',
    },
  };
}

describe('runProfileMigration', () => {
  beforeEach(() => {
    installLocalStorage();
    useProfilesStore.setState({ profiles: {}, activeProfileId: null, hydrated: true });
    useChartLibraryStore.setState({ charts: {}, hydrated: true });
    useChatStore.setState({ threads: {}, messages: {}, hydrated: true });
    setActiveProfileScope(null);
    setActiveChatScope(null);
  });

  // Helper: seed a legacy chat thread with no profile_id (pre-persistence orphan).
  function seedOrphanThread(threadId: string): void {
    useChatStore.setState((state) => ({
      threads: {
        ...state.threads,
        [threadId]: {
          id: threadId,
          profile_id: undefined as unknown as string,
          title: null,
          created_at: '1970-01-01T00:00:00.000Z',
          updated_at: '1970-01-01T00:00:00.000Z',
          archived_at: null,
          message_count: 0,
        },
      },
    }));
  }

  it('creates a default "Me" profile and claims existing orphan charts', async () => {
    useChartLibraryStore.getState().saveChart(makeChart('legacy', true)); // no profile_id

    await runProfileMigration();

    const profiles = useProfilesStore.getState().listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Me');

    const active = useProfilesStore.getState().activeProfileId;
    expect(active).toBe(profiles[0].id);
    // The legacy chart now belongs to the default profile.
    expect(useChartLibraryStore.getState().getChart('legacy')?.profile_id).toBe(active);
    // And it still resolves as the primary chart under the active scope.
    expect(useChartLibraryStore.getState().getPrimaryChart()?.chart_id).toBe('legacy');
  });

  it('is idempotent — a second run creates no extra profile and loses no data', async () => {
    useChartLibraryStore.getState().saveChart(makeChart('legacy', true));
    await runProfileMigration();
    await runProfileMigration();

    expect(useProfilesStore.getState().listProfiles()).toHaveLength(1);
    expect(useChartLibraryStore.getState().listAllCharts()).toHaveLength(1);
  });

  it('does nothing when there are no charts (fresh install)', async () => {
    await runProfileMigration();
    expect(useProfilesStore.getState().listProfiles()).toHaveLength(0);
    expect(useProfilesStore.getState().activeProfileId).toBeNull();
  });

  it('claims orphan charts into the already-active profile when profiles exist', async () => {
    const id = useProfilesStore.getState().createProfile('Alice');
    useChartLibraryStore.getState().saveChart(makeChart('owned', true, id));
    useChartLibraryStore.getState().saveChart(makeChart('orphan', false)); // legacy

    await runProfileMigration();

    expect(useChartLibraryStore.getState().getChart('orphan')?.profile_id).toBe(id);
    expect(useProfilesStore.getState().listProfiles()).toHaveLength(1);
  });

  it('claims an orphan chat thread into the default profile created from charts', async () => {
    useChartLibraryStore.getState().saveChart(makeChart('legacy', true)); // no profile_id
    seedOrphanThread('orphan-thread');

    await runProfileMigration();

    const active = useProfilesStore.getState().activeProfileId;
    expect(active).toBeTruthy();
    expect(useChatStore.getState().getActiveThread(active as string)?.id).toBe('orphan-thread');
  });

  it('claims orphan chat threads into the already-active profile, idempotently', async () => {
    const id = useProfilesStore.getState().createProfile('Alice');
    seedOrphanThread('orphan-thread');

    await runProfileMigration();
    await runProfileMigration();

    expect(useChatStore.getState().getActiveThread(id)?.id).toBe('orphan-thread');
    expect(useChatStore.getState().listThreads(id)).toHaveLength(1);
  });
});
