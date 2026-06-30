/**
 * Chat history store — the on-device, local-first persistence for the dashboard
 * conversation. Chat used to be ephemeral React-local state (lost on reload);
 * this store keeps threads + messages per profile in IndexedDB so a person's
 * conversation survives a refresh / PWA reopen, mirroring `chartLibrary`.
 *
 * Shape is normalized: `threads` keyed by thread id, `messages` keyed by
 * `thread_id` (a flat list per thread). Each thread carries its owning
 * `profile_id` so listing is scoped per person, exactly like charts.
 *
 * No backend, no account. Persistence is a browser-only enhancement — outside a
 * browser (SSR/tests) IndexedDB is absent and the store runs in-memory.
 */

import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

import type { ChatMessage, ChatThread } from '@almamesh/shared-types';

type ChatRole = ChatMessage['role'];

/** A single IndexedDB key holding the whole chat history, persisted by zustand. */
const PERSIST_NAME = 'almamesh-chat-history';

/** Bump when the persisted chat shape changes; always pair with `migrate`. */
export const CHAT_PERSIST_VERSION = 1;

/** The slice of the store that `partialize` actually persists. */
export interface PersistedChatState {
  readonly threads: Readonly<Record<string, ChatThread>>;
  readonly messages: Readonly<Record<string, readonly ChatMessage[]>>;
}

/** A plain (non-array) object — the only shape `threads`/`messages` may take. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Defensive hydration: tolerate ANY old/unknown/corrupt persisted blob and
 * always return valid `{ threads, messages }` maps. A returning visitor whose
 * stored chat history is malformed (a string, an array, one half missing) must
 * never crash the app — each half independently falls back to an empty map.
 */
export function migrateChatPersistedState(
  persisted: unknown,
  _fromVersion: number,
): PersistedChatState {
  const source = isPlainRecord(persisted) ? persisted : {};
  return {
    threads: isPlainRecord(source.threads)
      ? (source.threads as PersistedChatState['threads'])
      : {},
    messages: isPlainRecord(source.messages)
      ? (source.messages as PersistedChatState['messages'])
      : {},
  };
}

/**
 * The active profile scope used to resolve "the current thread". Held as a
 * module variable (not a prop) so the profiles store can push it in without
 * chat importing the profiles store — keeping the two decoupled, exactly like
 * `chartLibrary.activeProfileScope`. `null` means "no active profile".
 */
let activeChatScope: string | null = null;

/**
 * Set the active chat scope. Called by the profiles store on hydrate and on
 * every active-profile change. Idempotent; no chat state mutation.
 */
export function setActiveChatScope(profileId: string | null): void {
  activeChatScope = profileId;
}

/** Read the active chat scope (test/coordination helper). */
export function getActiveChatScope(): string | null {
  return activeChatScope;
}

/**
 * Generate an id. Uses `crypto.randomUUID` where available (all real browsers +
 * the Node test env), with a counter fallback so the store never throws in an
 * exotic runtime. Mirrors `profiles.nextProfileId`.
 */
let idFallbackCounter = 0;
function nextId(prefix: string): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  idFallbackCounter += 1;
  return `${prefix}-${Date.now()}-${idFallbackCounter}`;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** IndexedDB-backed zustand storage; benign no-op outside browsers (SSR/tests). */
const idbStorage: StateStorage = {
  getItem: async (name) => (hasIndexedDb() ? ((await idbGet<string>(name)) ?? null) : null),
  setItem: async (name, value) => {
    if (hasIndexedDb()) {
      await idbSet(name, value);
    }
  },
  removeItem: async (name) => {
    if (hasIndexedDb()) {
      await idbDel(name);
    }
  },
};

export interface ChatStore {
  /** All threads, keyed by thread id. */
  readonly threads: Readonly<Record<string, ChatThread>>;
  /** Messages keyed by `thread_id` (a flat, ordered list per thread). */
  readonly messages: Readonly<Record<string, readonly ChatMessage[]>>;
  /** True once zustand has rehydrated from IndexedDB. */
  readonly hydrated: boolean;

  /**
   * Return the profile's current open thread, creating one when none exists.
   * Returns the thread id. `chartId` links a freshly-created thread to a chart.
   */
  ensureThread: (profileId: string, chartId?: string) => string;
  appendMessage: (threadId: string, role: ChatRole, content: string) => ChatMessage;
  getMessages: (threadId: string) => ChatMessage[];
  /** All threads for a profile, newest-updated first. */
  listThreads: (profileId: string) => ChatThread[];
  /** The profile's most-recently-updated thread, or null when it has none. */
  getActiveThread: (profileId: string) => ChatThread | null;
  renameThread: (threadId: string, title: string) => void;
  deleteThread: (threadId: string) => void;
  /** Assign all profile-less (orphan) threads to a profile — idempotent migration. */
  assignOrphanThreadsToProfile: (profileId: string) => number;
  /** Wipe all threads and messages — the "start fresh" reset. */
  clearAll: () => void;
}

/** Newest-updated first (stable thread ordering for listing + active resolution). */
function byUpdatedDesc(a: ChatThread, b: ChatThread): number {
  return b.updated_at.localeCompare(a.updated_at);
}

/** A fresh, empty thread owned by a profile. */
function makeThread(profileId: string, chartId?: string): ChatThread {
  const now = new Date().toISOString();
  return {
    id: nextId('thread'),
    profile_id: profileId,
    chart_id: chartId,
    title: null,
    created_at: now,
    updated_at: now,
    archived_at: null,
    message_count: 0,
  };
}

/** The first user message becomes the title only when the thread is untitled. */
function deriveTitle(thread: ChatThread, role: ChatRole, content: string): string | null {
  if (thread.title !== null || role !== 'user') {
    return thread.title;
  }
  return content.trim() || null;
}

export const chatStoreCreator: StateCreator<ChatStore> = (set, get) => ({
  threads: {},
  messages: {},
  hydrated: false,

  ensureThread: (profileId, chartId) => {
    const existing = get().getActiveThread(profileId);
    if (existing) {
      return existing.id;
    }
    const thread = makeThread(profileId, chartId);
    set((state) => ({ threads: { ...state.threads, [thread.id]: thread } }));
    return thread.id;
  },

  appendMessage: (threadId, role, content) => {
    const now = new Date().toISOString();
    const message: ChatMessage = {
      id: nextId('msg'),
      thread_id: threadId,
      role,
      content,
      created_at: now,
    };
    set((state) => {
      const thread = state.threads[threadId];
      const list = state.messages[threadId] ?? [];
      const nextMessages = { ...state.messages, [threadId]: [...list, message] };
      if (!thread) {
        return { messages: nextMessages };
      }
      const nextThread: ChatThread = {
        ...thread,
        title: deriveTitle(thread, role, content),
        message_count: list.length + 1,
        updated_at: now,
      };
      return { threads: { ...state.threads, [threadId]: nextThread }, messages: nextMessages };
    });
    return message;
  },

  getMessages: (threadId) => [...(get().messages[threadId] ?? [])],

  listThreads: (profileId) =>
    Object.values(get().threads)
      .filter((t) => t.profile_id === profileId)
      .sort(byUpdatedDesc),

  getActiveThread: (profileId) => get().listThreads(profileId)[0] ?? null,

  renameThread: (threadId, title) => {
    set((state) => {
      const thread = state.threads[threadId];
      if (!thread) {
        return state;
      }
      const next: ChatThread = { ...thread, title: title.trim() || thread.title };
      return { threads: { ...state.threads, [threadId]: next } };
    });
  },

  deleteThread: (threadId) => {
    set((state) => {
      const threads = { ...state.threads };
      delete threads[threadId];
      const messages = { ...state.messages };
      delete messages[threadId];
      return { threads, messages };
    });
  },

  assignOrphanThreadsToProfile: (profileId) => {
    let claimed = 0;
    set((state) => {
      const next: Record<string, ChatThread> = {};
      for (const [id, thread] of Object.entries(state.threads)) {
        if (thread.profile_id === undefined || thread.profile_id === null) {
          next[id] = { ...thread, profile_id: profileId };
          claimed += 1;
        } else {
          next[id] = thread;
        }
      }
      return { threads: next };
    });
    return claimed;
  },

  clearAll: () => {
    set({ threads: {}, messages: {} });
  },
});

export const useChatStore = create<ChatStore>()(
  persist<ChatStore, [], [], PersistedChatState>(chatStoreCreator, {
    name: PERSIST_NAME,
    version: CHAT_PERSIST_VERSION,
    migrate: migrateChatPersistedState,
    storage: createJSONStorage(() => idbStorage),
    partialize: (state) => ({ threads: state.threads, messages: state.messages }),
    onRehydrateStorage: () => () => {
      useChatStore.setState({ hydrated: true });
    },
  }),
);

/**
 * Resolve once the chat store has finished rehydrating from IndexedDB. Mirrors
 * `whenChartLibraryHydrated` / `whenProfilesHydrated` — await before any read
 * that must reflect the persisted truth (avoids the async-rehydrate race).
 */
export function whenChatHydrated(): Promise<void> {
  const { persist: persistApi } = useChatStore;
  if (!persistApi?.hasHydrated || persistApi.hasHydrated()) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const unsubscribe = persistApi.onFinishHydration(() => {
      unsubscribe?.();
      resolve();
    });
  });
}

/**
 * Assign every profile-less (orphan) chat thread to a profile — the chat
 * analogue of `chartLibrary.assignOrphanChartsToProfile`. Thin wrapper over the
 * store action so the profiles store stays chat-agnostic and imports only this
 * one helper plus `whenChatHydrated` / `setActiveChatScope`.
 */
export function assignOrphanChatThreads(profileId: string): number {
  return useChatStore.getState().assignOrphanThreadsToProfile(profileId);
}
