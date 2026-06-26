/**
 * Mesh-relationship behavior of the profiles store: the anchor ("self")
 * invariant, member relationships, the persisted-store v0→v1 migration, and
 * the pure mesh selectors. See profiles.test.ts for the base profile CRUD.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { MEMBER_RELATIONSHIPS, RELATIONSHIPS } from '@almamesh/shared-types';

import { useChartLibraryStore } from './chartLibrary';
import {
  anchorProfileOf,
  listMembersOf,
  meshReadyOf,
  migrateProfilesPersistedState,
  PROFILES_PERSIST_VERSION,
  profilesStoreCreator,
  useProfilesStore,
  type PersistedProfilesState,
  type Profile,
  type ProfilesStore,
  type SetAnchorResult,
  type SetRelationshipResult,
} from './profiles';

// Minimal localStorage shim so the routing-flag mirror has somewhere to write.
function installLocalStorage(): Map<string, string> {
  const backing = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  return backing;
}

function newStore() {
  return createStore<ProfilesStore>(profilesStoreCreator);
}

describe('mesh relationship vocabulary', () => {
  it('matches the backend enum values, with self as the frontend-only anchor marker', () => {
    // MUST stay in lockstep with the backend relationship enum (mesh math).
    expect([...MEMBER_RELATIONSHIPS]).toEqual([
      'spouse',
      'partner',
      'mother',
      'father',
      'child',
      'sibling',
      'friend',
      'business',
    ]);
    expect([...RELATIONSHIPS]).toEqual(['self', ...MEMBER_RELATIONSHIPS]);
  });
});

describe('profilesStore mesh relationships', () => {
  beforeEach(() => {
    installLocalStorage();
    useChartLibraryStore.setState({ charts: {} });
  });

  it('setAnchor marks the profile as self and returns ok', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const result: SetAnchorResult = store.getState().setAnchor(me);
    expect(result).toEqual({ ok: true });
    expect(store.getState().getAnchorProfile()?.id).toBe(me);
    expect(store.getState().profiles[me]?.relationship).toBe('self');
  });

  it('rejects a second self with a typed result and leaves both profiles unchanged', () => {
    const store = newStore();
    const a = store.getState().createProfile('Alice');
    const b = store.getState().createProfile('Bob');
    store.getState().setAnchor(a);
    const result = store.getState().setAnchor(b);
    expect(result).toEqual({ ok: false, reason: 'anchor-exists', anchorId: a });
    expect(store.getState().getAnchorProfile()?.id).toBe(a);
    expect(store.getState().profiles[b]?.relationship).toBeUndefined();
  });

  it('setAnchor is idempotent for the current anchor', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    store.getState().setAnchor(me);
    expect(store.getState().setAnchor(me)).toEqual({ ok: true });
    expect(store.getState().getAnchorProfile()?.id).toBe(me);
  });

  it('setAnchor returns not-found for an unknown id', () => {
    const store = newStore();
    store.getState().createProfile('Alice');
    expect(store.getState().setAnchor('nope')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('setRelationship assigns the relationship and links relatedTo to the anchor', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const mom = store.getState().createProfile('Amma');
    store.getState().setAnchor(me);
    const result: SetRelationshipResult = store.getState().setRelationship(mom, 'mother');
    expect(result).toEqual({ ok: true });
    expect(store.getState().profiles[mom]?.relationship).toBe('mother');
    expect(store.getState().profiles[mom]?.relatedTo).toBe(me);
  });

  it('relationships assigned before any anchor get relatedTo backfilled by setAnchor', () => {
    const store = newStore();
    const mom = store.getState().createProfile('Amma');
    const me = store.getState().createProfile('Asha');
    store.getState().setRelationship(mom, 'mother');
    expect(store.getState().profiles[mom]?.relatedTo).toBeUndefined();
    store.getState().setAnchor(me);
    expect(store.getState().profiles[mom]?.relatedTo).toBe(me);
  });

  it('setRelationship refuses self at runtime — the anchor goes through setAnchor', () => {
    const store = newStore();
    const a = store.getState().createProfile('Alice');
    // A JS caller can bypass the MemberRelationship compile-time guard.
    const smuggled = 'self' as unknown as (typeof MEMBER_RELATIONSHIPS)[number];
    expect(store.getState().setRelationship(a, smuggled)).toEqual({
      ok: false,
      reason: 'self-requires-set-anchor',
    });
    expect(store.getState().profiles[a]?.relationship).toBeUndefined();
  });

  it('setRelationship returns not-found for an unknown id', () => {
    const store = newStore();
    expect(store.getState().setRelationship('nope', 'friend')).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('setRelationship on the anchor demotes it and clears everyone’s relatedTo', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const mom = store.getState().createProfile('Amma');
    store.getState().setAnchor(me);
    store.getState().setRelationship(mom, 'mother');
    store.getState().setRelationship(me, 'friend');
    expect(store.getState().getAnchorProfile()).toBeUndefined();
    expect(store.getState().profiles[me]?.relationship).toBe('friend');
    expect(store.getState().profiles[me]?.relatedTo).toBeUndefined();
    expect(store.getState().profiles[mom]?.relationship).toBe('mother');
    expect(store.getState().profiles[mom]?.relatedTo).toBeUndefined();
  });

  it('clearRelationship removes relationship and relatedTo from a member', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const friend = store.getState().createProfile('Maya');
    store.getState().setAnchor(me);
    store.getState().setRelationship(friend, 'friend');
    store.getState().clearRelationship(friend);
    expect(store.getState().profiles[friend]?.relationship).toBeUndefined();
    expect(store.getState().profiles[friend]?.relatedTo).toBeUndefined();
  });

  it('clearRelationship on the anchor un-anchors; members keep labels but lose relatedTo', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const mom = store.getState().createProfile('Amma');
    store.getState().setAnchor(me);
    store.getState().setRelationship(mom, 'mother');
    store.getState().clearRelationship(me);
    expect(store.getState().getAnchorProfile()).toBeUndefined();
    expect(store.getState().profiles[mom]?.relationship).toBe('mother');
    expect(store.getState().profiles[mom]?.relatedTo).toBeUndefined();
  });

  it('deleting the anchor cascade-clears relationship references to it', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const mom = store.getState().createProfile('Amma');
    const friend = store.getState().createProfile('Maya');
    store.getState().setAnchor(me);
    store.getState().setRelationship(mom, 'mother');
    store.getState().setRelationship(friend, 'friend');
    store.getState().deleteProfile(me);
    expect(store.getState().profiles[mom]?.relationship).toBeUndefined();
    expect(store.getState().profiles[mom]?.relatedTo).toBeUndefined();
    expect(store.getState().profiles[friend]?.relationship).toBeUndefined();
    expect(store.getState().profiles[friend]?.relatedTo).toBeUndefined();
  });

  it('deleting a member leaves the anchor and other members intact', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const mom = store.getState().createProfile('Amma');
    const friend = store.getState().createProfile('Maya');
    store.getState().setAnchor(me);
    store.getState().setRelationship(mom, 'mother');
    store.getState().setRelationship(friend, 'friend');
    store.getState().deleteProfile(friend);
    expect(store.getState().getAnchorProfile()?.id).toBe(me);
    expect(store.getState().profiles[mom]?.relationship).toBe('mother');
    expect(store.getState().profiles[mom]?.relatedTo).toBe(me);
  });

  it('listMembers sorts by canonical relationship order, then name; the anchor is excluded', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const friendB = store.getState().createProfile('Zoe');
    const friendA = store.getState().createProfile('Maya');
    const mom = store.getState().createProfile('Amma');
    const plain = store.getState().createProfile('Stranger');
    store.getState().setAnchor(me);
    store.getState().setRelationship(friendB, 'friend');
    store.getState().setRelationship(friendA, 'friend');
    store.getState().setRelationship(mom, 'mother');
    const members = store.getState().listMembers();
    expect(members.map((p: Profile) => p.name)).toEqual(['Amma', 'Maya', 'Zoe']);
    expect(members.some((p: Profile) => p.id === me || p.id === plain)).toBe(false);
  });

  it('isMeshReady requires an anchor plus at least one member', () => {
    const store = newStore();
    const me = store.getState().createProfile('Asha');
    const mom = store.getState().createProfile('Amma');
    expect(store.getState().isMeshReady()).toBe(false);
    store.getState().setRelationship(mom, 'mother');
    expect(store.getState().isMeshReady()).toBe(false); // member but no anchor
    store.getState().setAnchor(me);
    expect(store.getState().isMeshReady()).toBe(true);
  });
});

describe('pure mesh selectors', () => {
  const base = { createdAt: '2024-01-01T00:00:00.000Z', avatarTint: '#C9A24B' };
  const profiles: Record<string, Profile> = {
    me: { id: 'me', name: 'Asha', ...base, relationship: 'self' },
    mom: { id: 'mom', name: 'Amma', ...base, relationship: 'mother', relatedTo: 'me' },
    plain: { id: 'plain', name: 'Legacy', ...base },
  };

  it('anchorProfileOf finds the self profile', () => {
    expect(anchorProfileOf(profiles)?.id).toBe('me');
    expect(anchorProfileOf({})).toBeUndefined();
  });

  it('listMembersOf returns only related, non-self profiles', () => {
    expect(listMembersOf(profiles).map((p) => p.id)).toEqual(['mom']);
  });

  it('meshReadyOf needs anchor + member', () => {
    expect(meshReadyOf(profiles)).toBe(true);
    expect(meshReadyOf({ me: profiles.me })).toBe(false);
    expect(meshReadyOf({ mom: profiles.mom })).toBe(false);
  });
});

describe('persisted-store migration v0 → v1', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('migrateProfilesPersistedState passes a v0 payload through unchanged', () => {
    const v0: PersistedProfilesState = {
      profiles: {
        p1: { id: 'p1', name: 'Alice', createdAt: '2024-01-01T00:00:00.000Z', avatarTint: '#C9A24B' },
      },
      activeProfileId: 'p1',
    };
    const migrated = migrateProfilesPersistedState(v0, 0);
    expect(migrated).toEqual(v0);
  });

  it('a legacy (version-0) install rehydrates intact — no auto-anointed anchor', () => {
    const backing = new Map<string, string>();
    const storage: StateStorage = {
      getItem: (name) => backing.get(name) ?? null,
      setItem: (name, value) => void backing.set(name, value),
      removeItem: (name) => void backing.delete(name),
    };
    backing.set(
      'almamesh-profiles-migration-test',
      JSON.stringify({
        state: {
          profiles: {
            p1: {
              id: 'p1',
              name: 'Alice',
              createdAt: '2024-01-01T00:00:00.000Z',
              avatarTint: '#C9A24B',
            },
            p2: {
              id: 'p2',
              name: 'Bob',
              createdAt: '2024-01-02T00:00:00.000Z',
              avatarTint: '#3A4FB0',
            },
          },
          activeProfileId: 'p2',
        },
        version: 0,
      }),
    );
    const store = createStore<ProfilesStore>()(
      persist<ProfilesStore, [], [], PersistedProfilesState>(profilesStoreCreator, {
        name: 'almamesh-profiles-migration-test',
        storage: createJSONStorage(() => storage),
        version: PROFILES_PERSIST_VERSION,
        migrate: migrateProfilesPersistedState,
        partialize: (s) => ({ profiles: s.profiles, activeProfileId: s.activeProfileId }),
      }),
    );
    const state = store.getState();
    expect(Object.keys(state.profiles)).toHaveLength(2);
    expect(state.activeProfileId).toBe('p2');
    // Legacy people stay plain switchable users; the user assigns the anchor.
    expect(state.profiles.p1?.relationship).toBeUndefined();
    expect(state.profiles.p2?.relationship).toBeUndefined();
    expect(state.getAnchorProfile()).toBeUndefined();
  });

  it('the production store persists at version 1 with the migrate hook wired', () => {
    const options = useProfilesStore.persist.getOptions();
    expect(options.version).toBe(PROFILES_PERSIST_VERSION);
    expect(typeof options.migrate).toBe('function');
  });
});
