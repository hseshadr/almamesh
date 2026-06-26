import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useChatThread } from '../useChatThread';
import { useChatStore } from '@almamesh/store';
import {
  __setMemoryForTest,
  __resetMemoryForTest,
  type ChatMemoryFacade,
} from '../../lib/chatMemory';

const PROFILE = 'profile-A';
const CHART = 'chart-A';

/** Reset the persisted chat store between tests (in-memory under happy-dom). */
function clearChatStore(): void {
  useChatStore.setState({ threads: {}, messages: {} });
}

function fakeMemory(): { memory: ChatMemoryFacade; index: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn> } {
  const index = vi.fn().mockResolvedValue(undefined);
  const retrieve = vi.fn().mockResolvedValue([
    { text: 'earlier: your Mars is in Scorpio', message_id: 'm0', thread_id: 't0', score: 0.8 },
  ]);
  return { memory: { indexMessage: index, retrieve }, index, retrieve };
}

/** A stream function that yields a fixed answer token-by-token via onToken. */
function makeStreamFn(answer: string) {
  return vi.fn(
    async (input: {
      question: string;
      history: readonly { role: string; content: string }[];
      retrievedContext: readonly string[];
      onToken: (t: string) => void;
    }): Promise<string> => {
      for (const ch of answer) {
        input.onToken(ch);
      }
      return answer;
    },
  );
}

describe('useChatThread', () => {
  beforeEach(() => {
    clearChatStore();
    __resetMemoryForTest();
  });

  afterEach(() => {
    clearChatStore();
    __resetMemoryForTest();
    vi.restoreAllMocks();
  });

  it('starts with no messages and no thread for a fresh profile', () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    expect(result.current.messages).toEqual([]);
  });

  it('persists the user question and the streamed assistant answer to the store', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    const stream = makeStreamFn('Mars in Scorpio gives drive.');

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));

    await act(async () => {
      await result.current.submit('What about my Mars?', stream);
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'What about my Mars?' });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Mars in Scorpio gives drive.',
    });

    // Survives a remount (the store is the source of truth, not React-local state).
    const threadId = result.current.threadId;
    const remount = renderHook(() => useChatThread(PROFILE, CHART));
    expect(remount.result.current.threadId).toBe(threadId);
    expect(remount.result.current.messages.length).toBe(2);
  });

  it('passes prior turns as history and retrieved snippets as retrievedContext to the stream fn', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));

    const first = makeStreamFn('A1');
    await act(async () => {
      await result.current.submit('Q1', first);
    });

    const second = makeStreamFn('A2');
    await act(async () => {
      await result.current.submit('Q2', second);
    });

    const callInput = second.mock.calls[0][0];
    expect(callInput.question).toBe('Q2');
    // History excludes the brand-new Q2 (sent separately) but includes Q1/A1.
    expect(callInput.history).toEqual([
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
    ]);
    expect(callInput.retrievedContext).toEqual(['earlier: your Mars is in Scorpio']);
  });

  it('indexes BOTH the user message and the assistant answer for RAG/search', async () => {
    const { memory, index } = fakeMemory();
    __setMemoryForTest(memory);
    const stream = makeStreamFn('the answer');

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('the question', stream);
    });

    await waitFor(() => expect(index).toHaveBeenCalledTimes(2));
    const contents = index.mock.calls.map((c) => c[0].content);
    expect(contents).toContain('the question');
    expect(contents).toContain('the answer');
    for (const call of index.mock.calls) {
      expect(call[0].profile_id).toBe(PROFILE);
    }
  });

  it('a failing stream still persists the user message and surfaces the error', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stream = vi.fn().mockRejectedValue(new Error('endpoint down'));

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('hello', stream);
    });

    await waitFor(() => {
      const roles = result.current.messages.map((m) => m.role);
      expect(roles).toContain('user');
      // An assistant error bubble is appended so the user is not left hanging.
      expect(roles).toContain('assistant');
    });
  });
});
