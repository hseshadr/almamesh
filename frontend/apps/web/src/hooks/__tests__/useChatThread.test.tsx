import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import {
  CHAT_STREAM_ERROR_COPY,
  describeChatStreamError,
  isMappedChatStreamError,
  useChatThread,
} from '../useChatThread';
import {
  LlmRequestError,
  OnDeviceContextOverflowError,
  OnDeviceModelRecordError,
  PrivacyViolationError,
} from '@almamesh/llm';
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

  it('an error turn is flagged and NEVER re-enters the model-visible history', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));

    const failing = vi.fn().mockRejectedValue(new Error('endpoint down'));
    await act(async () => {
      await result.current.submit('Q1', failing);
    });
    await waitFor(() => expect(result.current.messages.length).toBe(2));
    // The error turn carries the flag so the UI can render it as an error bubble.
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', error: true });

    // The NEXT submit must not feed the error bubble back to the model.
    const second = makeStreamFn('A2');
    await act(async () => {
      await result.current.submit('Q2', second);
    });
    const callInput = second.mock.calls[0][0];
    expect(callInput.history).toEqual([{ role: 'user', content: 'Q1' }]);
  });

  it('a context-window overflow gets actionable "shorter question / new chat" copy', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = vi.fn().mockRejectedValue(new OnDeviceContextOverflowError());

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('a very long question', failing);
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    const bubble = result.current.messages[1];
    expect(bubble.error).toBe(true);
    expect(bubble.content).toContain('shorter question');
  });

  it('a missing on-device model gets actionable re-download guidance', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = vi.fn().mockRejectedValue(new OnDeviceModelRecordError());

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('hello', failing);
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    const bubble = result.current.messages[1];
    expect(bubble.error).toBe(true);
    expect(bubble.content).toMatch(/re-select or re-download/i);
  });

  it('a privacy violation surfaces its own fail-closed message, never QA_001', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // SYNTHETIC endpoint: the fence's message is user-facing by design.
    const failing = vi.fn().mockRejectedValue(
      new PrivacyViolationError(
        'local_only privacy mode refuses to send chart data to https://example.invalid',
      ),
    );

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('hello', failing);
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    const bubble = result.current.messages[1];
    expect(bubble.error).toBe(true);
    expect(bubble.content).toContain('local_only');
    expect(bubble.content).not.toContain('QA_001');
  });

  it('a 404 model-not-found from the endpoint gets "pick a different model" guidance', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = vi.fn().mockRejectedValue(
      new LlmRequestError('HTTP 404: No endpoints found for test-org/retired-model', {
        status: 404,
      }),
    );

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('hello', failing);
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    const bubble = result.current.messages[1];
    expect(bubble.error).toBe(true);
    expect(bubble.content).toContain('Settings → AI');
    expect(bubble.content).toMatch(/model/i);
    expect(bubble.content).not.toContain('QA_001');
  });

  it('an unreachable endpoint (fetch TypeError) points at the endpoint setting', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // What `fetch` throws when the endpoint is down / DNS fails / CORS blocks.
    const failing = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('hello', failing);
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    const bubble = result.current.messages[1];
    expect(bubble.error).toBe(true);
    expect(bubble.content).toMatch(/endpoint/i);
    expect(bubble.content).not.toContain('QA_001');
  });

  it('a non-404 request failure gets actionable retry/settings copy (not QA_001)', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = vi.fn().mockRejectedValue(
      new LlmRequestError('HTTP 500 from endpoint', { status: 500 }),
    );

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('hello', failing);
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    const bubble = result.current.messages[1];
    expect(bubble.error).toBe(true);
    expect(bubble.content).toContain('Settings → AI');
    expect(bubble.content).not.toContain('QA_001');
  });

  it('an unknown failure keeps the generic QA_001 fallback (still flagged)', async () => {
    const { memory } = fakeMemory();
    __setMemoryForTest(memory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = vi.fn().mockRejectedValue(new Error('mystery'));

    const { result } = renderHook(() => useChatThread(PROFILE, CHART));
    await act(async () => {
      await result.current.submit('hello', failing);
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    const bubble = result.current.messages[1];
    expect(bubble.error).toBe(true);
    expect(bubble.content).toContain('QA_001');
  });
});

describe('isMappedChatStreamError — the page-catch rethrow contract', () => {
  it('is true for every typed cause the bubble mapper handles', () => {
    expect(isMappedChatStreamError(new OnDeviceContextOverflowError())).toBe(true);
    expect(isMappedChatStreamError(new OnDeviceModelRecordError())).toBe(true);
    expect(isMappedChatStreamError(new PrivacyViolationError('refused'))).toBe(true);
    expect(isMappedChatStreamError(new LlmRequestError('HTTP 500'))).toBe(true);
    expect(isMappedChatStreamError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('is false for unknown errors (those keep the generic QA_001 wrap)', () => {
    expect(isMappedChatStreamError(new Error('mystery'))).toBe(false);
    expect(isMappedChatStreamError('not an error')).toBe(false);
    expect(isMappedChatStreamError(undefined)).toBe(false);
  });
});

describe('the chat error mapping derives from ONE map (rethrow contract and copy cannot drift)', () => {
  it('covers exactly the typed causes the mapper is contracted to handle', () => {
    expect(Object.keys(CHAT_STREAM_ERROR_COPY).sort()).toEqual([
      'LlmRequestError',
      'OnDeviceContextOverflowError',
      'OnDeviceModelRecordError',
      'PrivacyViolationError',
      'TypeError',
    ]);
  });

  it('every mapped cause name is BOTH rethrown by the page catch AND given non-generic copy', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const name of Object.keys(CHAT_STREAM_ERROR_COPY)) {
      // Name-based match: class identity may be lost across a boundary.
      const error = new Error('synthetic failure');
      error.name = name;
      expect(isMappedChatStreamError(error), `${name} must be rethrown`).toBe(true);
      expect(
        describeChatStreamError(error),
        `${name} must get specific copy`,
      ).not.toContain('QA_001');
    }
  });

  it('an unmapped cause name stays on the generic QA_001 path in BOTH functions', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('mystery');
    error.name = 'SomeUnmappedError';
    expect(isMappedChatStreamError(error)).toBe(false);
    expect(describeChatStreamError(error)).toContain('QA_001');
  });
});
