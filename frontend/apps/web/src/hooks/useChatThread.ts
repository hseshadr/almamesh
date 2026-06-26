/**
 * useChatThread — store-backed, per-profile chat with RAG memory.
 *
 * Replaces ChatPanel's old ephemeral React-local message array. The chat store
 * (`@almamesh/store`, IndexedDB-backed) is the single source of truth, so a
 * conversation survives reload / PWA reopen. This hook:
 *
 *  - resolves the active thread for `(profileId, chartId)` reactively (rendering
 *    its persisted messages), creating one lazily only when the user submits;
 *  - on submit: persists the user turn, retrieves RAG context + prior history,
 *    delegates the actual LLM streaming to the caller's `stream` fn, then
 *    persists the assistant turn;
 *  - indexes BOTH turns into `@almamesh/memory` for semantic search + RAG.
 *
 * Memory is best-effort (see `lib/chatMemory`): an embedder failure is logged
 * and swallowed and never blocks the conversation.
 */

import { useCallback, useState } from 'react';
import { useChatStore } from '@almamesh/store';
import type { ChatMessage } from '@almamesh/shared-types';
import type { ChatTurn } from '@almamesh/llm';

import { indexChatMessage, retrieveContext } from '../lib/chatMemory';
import { getChatErrorMessage } from '../lib/errors';

/** Input the caller's stream fn receives; it wires `streamChartChat` with these. */
export interface ChatStreamInput {
  readonly question: string;
  readonly history: readonly ChatTurn[];
  readonly retrievedContext: readonly string[];
  readonly onToken: (token: string) => void;
}

/** A function that streams an answer (delegated to the Dashboard's LLM wiring). */
export type ChatStreamFn = (input: ChatStreamInput) => Promise<string>;

export interface UseChatThreadResult {
  /** The active thread's persisted messages (live; empty until first submit). */
  readonly messages: readonly ChatMessage[];
  /** The active thread id, or null when the profile has no thread yet. */
  readonly threadId: string | null;
  /** True while an answer is streaming. */
  readonly isStreaming: boolean;
  /** The partial assistant answer streaming in (empty when idle). */
  readonly streamingDraft: string;
  /** Submit a question: persist + stream + persist + index. */
  readonly submit: (question: string, stream: ChatStreamFn) => Promise<void>;
}

/** Prior persisted messages → ChatTurn[] for multi-turn memory. */
function toHistory(messages: readonly ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if ((m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0) {
      turns.push({ role: m.role, content: m.content });
    }
  }
  return turns;
}

export function useChatThread(
  profileId: string | null,
  chartId: string | null,
): UseChatThreadResult {
  // Reactive: re-render when the store's threads/messages change.
  const threadsById = useChatStore((s) => s.threads);
  const messagesByThread = useChatStore((s) => s.messages);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingDraft, setStreamingDraft] = useState('');

  // Derive the active thread + its messages directly from store state (no effect,
  // no duplicated local copy) so reload/profile-switch reflects the truth.
  const activeThread = profileId
    ? Object.values(threadsById)
        .filter((t) => t.profile_id === profileId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
    : null;
  const threadId = activeThread?.id ?? null;
  const messages = threadId ? (messagesByThread[threadId] ?? []) : [];

  const submit = useCallback(
    async (question: string, stream: ChatStreamFn): Promise<void> => {
      const q = question.trim();
      if (!q || !profileId || isStreaming) {
        return;
      }
      const store = useChatStore.getState();
      const tid = store.ensureThread(profileId, chartId ?? undefined);
      const history = toHistory(store.getMessages(tid));

      const userMessage = store.appendMessage(tid, 'user', q);
      void indexChatMessage({ id: userMessage.id, thread_id: tid, profile_id: profileId, content: q });

      setIsStreaming(true);
      setStreamingDraft('');
      try {
        const retrievedContext = await retrieveContext(q, profileId);
        let draft = '';
        const answer = await stream({
          question: q,
          history,
          retrievedContext,
          onToken: (token) => {
            draft += token;
            setStreamingDraft(draft);
          },
        });
        const finalAnswer = answer || draft;
        const assistantMessage = store.appendMessage(tid, 'assistant', finalAnswer);
        void indexChatMessage({
          id: assistantMessage.id,
          thread_id: tid,
          profile_id: profileId,
          content: finalAnswer,
        });
      } catch (error) {
        console.error('[useChatThread] stream failed:', error);
        store.appendMessage(tid, 'assistant', getChatErrorMessage('QA_001', error));
      } finally {
        setIsStreaming(false);
        setStreamingDraft('');
      }
    },
    [profileId, chartId, isStreaming],
  );

  return { messages, threadId, isStreaming, streamingDraft, submit };
}

export default useChatThread;
