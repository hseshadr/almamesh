import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';

import {
  chatStoreCreator,
  migrateChatPersistedState,
  setActiveChatScope,
  type ChatStore,
} from './chat';

// No IndexedDB in the test runtime, so the store runs in-memory and hydration
// resolves immediately — exactly the SSR/test path, mirroring chartLibrary's
// harness. The store creator is exported so each case gets a fresh vanilla store.
function newStore() {
  return createStore<ChatStore>(chatStoreCreator);
}

describe('migrateChatPersistedState (defensive hydration)', () => {
  it('passes a valid previous-shape blob through unchanged', () => {
    const blob = { threads: { t1: { id: 't1' } }, messages: { t1: [] } };
    const out = migrateChatPersistedState(blob, 0);
    expect(out.threads).toEqual({ t1: { id: 't1' } });
    expect(out.messages).toEqual({ t1: [] });
  });

  it('does NOT throw on a malformed / corrupt blob, returns clean empty maps', () => {
    for (const corrupt of [null, undefined, 'oops', 42, [], { threads: 'x' }, { messages: 7 }]) {
      expect(() => migrateChatPersistedState(corrupt, 0)).not.toThrow();
      expect(migrateChatPersistedState(corrupt, 0)).toEqual({ threads: {}, messages: {} });
    }
  });

  it('repairs a half-shaped blob (keeps the valid half, defaults the other)', () => {
    expect(migrateChatPersistedState({ threads: { t1: { id: 't1' } } }, 0)).toEqual({
      threads: { t1: { id: 't1' } },
      messages: {},
    });
  });
});

describe('chatStore', () => {
  beforeEach(() => {
    setActiveChatScope(null);
  });

  describe('threads', () => {
    it('ensureThread creates a thread for a profile and returns its id', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      expect(threadId).toBeTruthy();
      expect(store.getState().listThreads('p1').map((t) => t.id)).toEqual([threadId]);
    });

    it('ensureThread reuses the profile’s current open thread', () => {
      const store = newStore();
      const first = store.getState().ensureThread('p1');
      const second = store.getState().ensureThread('p1');
      expect(second).toBe(first);
      expect(store.getState().listThreads('p1')).toHaveLength(1);
    });

    it('ensureThread records the optional chart_id on the thread', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1', 'chart-9');
      expect(store.getState().getActiveThread('p1')?.chart_id).toBe('chart-9');
    });

    it('renameThread updates the title', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      store.getState().renameThread(threadId, 'My reading');
      expect(store.getState().getActiveThread('p1')?.title).toBe('My reading');
    });

    it('deleteThread removes the thread and its messages', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      store.getState().appendMessage(threadId, 'user', 'hello');
      store.getState().deleteThread(threadId);
      expect(store.getState().listThreads('p1')).toHaveLength(0);
      expect(store.getState().getMessages(threadId)).toEqual([]);
    });
  });

  describe('messages', () => {
    it('appendMessage + getMessages round-trips in order', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      store.getState().appendMessage(threadId, 'user', 'What is my moon sign?');
      store.getState().appendMessage(threadId, 'assistant', 'Your moon is in Taurus.');
      const messages = store.getState().getMessages(threadId);
      expect(messages.map((m) => [m.role, m.content])).toEqual([
        ['user', 'What is my moon sign?'],
        ['assistant', 'Your moon is in Taurus.'],
      ]);
      expect(messages[0].thread_id).toBe(threadId);
    });

    it('appendMessage returns the created message with an id and timestamp', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      const message = store.getState().appendMessage(threadId, 'user', 'hi');
      expect(message.id).toBeTruthy();
      expect(message.created_at).toBeTruthy();
      expect(message.role).toBe('user');
    });

    it('maintains message_count and updated_at on the thread', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      const before = store.getState().getActiveThread('p1');
      store.getState().appendMessage(threadId, 'user', 'one');
      store.getState().appendMessage(threadId, 'assistant', 'two');
      const after = store.getState().getActiveThread('p1');
      expect(after?.message_count).toBe(2);
      // `updated_at` is refreshed on every append. Assert monotonic non-decrease
      // against the thread's creation time — robust to sub-millisecond clock
      // resolution (a strict `!==` flakes when both writes land in one ms).
      expect(after?.updated_at).toBeTruthy();
      expect(after?.updated_at.localeCompare(before?.created_at ?? '')).toBeGreaterThanOrEqual(0);
    });

    it('defaults the thread title from the first user message (trimmed)', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      store.getState().appendMessage(threadId, 'user', '   Tell me about my career   ');
      expect(store.getState().getActiveThread('p1')?.title).toBe('Tell me about my career');
    });

    it('does not derive the title from an assistant message', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      store.getState().appendMessage(threadId, 'assistant', 'I am ready to help.');
      expect(store.getState().getActiveThread('p1')?.title).toBeNull();
    });

    it('does not overwrite an explicit title with the first user message', () => {
      const store = newStore();
      const threadId = store.getState().ensureThread('p1');
      store.getState().renameThread(threadId, 'Pinned');
      store.getState().appendMessage(threadId, 'user', 'first question');
      expect(store.getState().getActiveThread('p1')?.title).toBe('Pinned');
    });
  });

  describe('profile scoping', () => {
    it('listThreads returns only the requested profile’s threads', () => {
      const store = newStore();
      const a = store.getState().ensureThread('A');
      const b = store.getState().ensureThread('B');
      expect(store.getState().listThreads('A').map((t) => t.id)).toEqual([a]);
      expect(store.getState().listThreads('B').map((t) => t.id)).toEqual([b]);
    });

    it('getActiveThread is scoped per profile', () => {
      const store = newStore();
      store.getState().ensureThread('A');
      store.getState().ensureThread('B');
      expect(store.getState().getActiveThread('A')?.profile_id).toBe('A');
      expect(store.getState().getActiveThread('B')?.profile_id).toBe('B');
    });

    it('getActiveThread is null for a profile with no threads', () => {
      const store = newStore();
      store.getState().ensureThread('A');
      expect(store.getState().getActiveThread('B')).toBeNull();
    });
  });

  describe('persist → rehydrate survival', () => {
    // The store persists only the `threads` + `messages` slices (its
    // `partialize`). Outside a browser there is no IndexedDB, so we model a
    // reload the way zustand `persist` does: serialize that slice to JSON, then
    // hydrate a fresh store from the parsed snapshot. This proves threads +
    // messages survive a store reconstruction (PWA reopen / hard refresh).
    function persistedSnapshot(store: ReturnType<typeof newStore>): string {
      const { threads, messages } = store.getState();
      return JSON.stringify({ threads, messages });
    }

    it('threads and messages survive a serialize → fresh-store round-trip', () => {
      const before = newStore();
      const threadId = before.getState().ensureThread('p1', 'chart-7');
      before.getState().appendMessage(threadId, 'user', 'What is my lagna?');
      before.getState().appendMessage(threadId, 'assistant', 'Your lagna is Leo.');

      const snapshot = persistedSnapshot(before) as string;

      // Simulate the reload: a brand-new store hydrated from the persisted slice.
      const after = newStore();
      after.setState(JSON.parse(snapshot) as Partial<ChatStore>);

      const thread = after.getState().getActiveThread('p1');
      expect(thread?.id).toBe(threadId);
      expect(thread?.chart_id).toBe('chart-7');
      expect(thread?.title).toBe('What is my lagna?');
      expect(thread?.message_count).toBe(2);
      expect(after.getState().getMessages(threadId).map((m) => m.content)).toEqual([
        'What is my lagna?',
        'Your lagna is Leo.',
      ]);
    });

    it('keeps threads scoped per profile across the round-trip', () => {
      const before = newStore();
      before.getState().ensureThread('A');
      before.getState().ensureThread('B');
      const snapshot = persistedSnapshot(before) as string;

      const after = newStore();
      after.setState(JSON.parse(snapshot) as Partial<ChatStore>);

      expect(after.getState().listThreads('A')).toHaveLength(1);
      expect(after.getState().listThreads('B')).toHaveLength(1);
      expect(after.getState().getActiveThread('A')?.profile_id).toBe('A');
    });
  });

  describe('orphan claiming (migration support)', () => {
    it('assignOrphanThreadsToProfile claims only profile-less threads, idempotently', () => {
      const store = newStore();
      const orphan = store.getState().ensureThread('');
      const owned = store.getState().ensureThread('p9');
      // Simulate a legacy orphan thread with no profile_id at all.
      store.setState((state) => ({
        threads: {
          ...state.threads,
          [orphan]: { ...state.threads[orphan], profile_id: undefined as unknown as string },
        },
      }));
      const first = store.getState().assignOrphanThreadsToProfile('p1');
      const second = store.getState().assignOrphanThreadsToProfile('p1');
      expect(first).toBe(1);
      expect(second).toBe(0);
      expect(store.getState().listThreads('p1').map((t) => t.id)).toContain(orphan);
      expect(store.getState().listThreads('p9').map((t) => t.id)).toEqual([owned]);
    });
  });
});
