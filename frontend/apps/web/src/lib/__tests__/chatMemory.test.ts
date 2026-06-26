import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  __setMemoryForTest,
  __resetMemoryForTest,
  indexChatMessage,
  retrieveContext,
  searchMemory,
} from '../chatMemory';
import type { ChatMemoryFacade } from '../chatMemory';

/** A controllable fake of the @almamesh/memory facade. */
function makeFakeMemory(): {
  memory: ChatMemoryFacade;
  indexMessage: ReturnType<typeof vi.fn>;
  retrieve: ReturnType<typeof vi.fn>;
} {
  const indexMessage = vi.fn().mockResolvedValue(undefined);
  const retrieve = vi.fn().mockResolvedValue([
    { text: 'past snippet', message_id: 'm1', thread_id: 't1', score: 0.9 },
  ]);
  return { memory: { indexMessage, retrieve }, indexMessage, retrieve };
}

describe('chatMemory', () => {
  beforeEach(() => {
    __resetMemoryForTest();
  });

  afterEach(() => {
    __resetMemoryForTest();
    vi.restoreAllMocks();
  });

  it('indexChatMessage forwards id/thread/profile/content to the facade', async () => {
    const { memory, indexMessage } = makeFakeMemory();
    __setMemoryForTest(memory);

    await indexChatMessage({
      id: 'msg-1',
      thread_id: 'thread-1',
      profile_id: 'profile-1',
      content: 'My Mars is in Scorpio',
    });

    expect(indexMessage).toHaveBeenCalledWith({
      id: 'msg-1',
      thread_id: 'thread-1',
      profile_id: 'profile-1',
      content: 'My Mars is in Scorpio',
    });
  });

  it('indexChatMessage is best-effort: a failing embedder never throws', async () => {
    const indexMessage = vi.fn().mockRejectedValue(new Error('worker boom'));
    const retrieve = vi.fn().mockResolvedValue([]);
    __setMemoryForTest({ indexMessage, retrieve });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      indexChatMessage({ id: 'm', thread_id: 't', profile_id: 'p', content: 'hi' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('indexChatMessage skips blank content (no embed work)', async () => {
    const { memory, indexMessage } = makeFakeMemory();
    __setMemoryForTest(memory);

    await indexChatMessage({ id: 'm', thread_id: 't', profile_id: 'p', content: '   ' });

    expect(indexMessage).not.toHaveBeenCalled();
  });

  it('retrieveContext returns the snippet texts for the prompt', async () => {
    const { memory } = makeFakeMemory();
    __setMemoryForTest(memory);

    const texts = await retrieveContext('what about my career?', 'profile-1');

    expect(texts).toEqual(['past snippet']);
  });

  it('retrieveContext is best-effort: a failing retrieve degrades to []', async () => {
    const indexMessage = vi.fn().mockResolvedValue(undefined);
    const retrieve = vi.fn().mockRejectedValue(new Error('no model'));
    __setMemoryForTest({ indexMessage, retrieve });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const texts = await retrieveContext('q', 'p');

    expect(texts).toEqual([]);
  });

  it('searchMemory returns full RetrievedChunk records with k=8 default', async () => {
    const { memory, retrieve } = makeFakeMemory();
    __setMemoryForTest(memory);

    const hits = await searchMemory('career', 'profile-1');

    expect(retrieve).toHaveBeenCalledWith('career', 'profile-1', 8);
    expect(hits[0]).toMatchObject({ message_id: 'm1', thread_id: 't1' });
  });

  it('searchMemory degrades to [] on failure (never throws to the UI)', async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error('boom'));
    __setMemoryForTest({ indexMessage: vi.fn(), retrieve });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(searchMemory('q', 'p')).resolves.toEqual([]);
  });

  it('a blank query short-circuits search/retrieve without touching the facade', async () => {
    const { memory, retrieve } = makeFakeMemory();
    __setMemoryForTest(memory);

    expect(await searchMemory('   ', 'p')).toEqual([]);
    expect(await retrieveContext('', 'p')).toEqual([]);
    expect(retrieve).not.toHaveBeenCalled();
  });
});
