import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '@almamesh/shared-types';
import {
  convertChatMessage,
  textFromComposerMessage,
} from '../AlmaMeshAssistantRuntime';

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1',
  thread_id: 'thread-1',
  role: 'assistant',
  content: 'A grounded answer.',
  created_at: '2026-09-21T20:00:00.000Z',
  ...overrides,
});

describe('AlmaMesh assistant-ui external-store adapter', () => {
  it('preserves stable identity, text, time, and completed assistant status', () => {
    expect(convertChatMessage(message())).toEqual({
      id: 'message-1',
      role: 'assistant',
      content: [{ type: 'text', text: 'A grounded answer.' }],
      createdAt: new Date('2026-09-21T20:00:00.000Z'),
      status: { type: 'complete', reason: 'stop' },
      metadata: { custom: { error: false, streaming: false } },
    });
  });

  it('keeps error notices visible as metadata without turning them into model state', () => {
    const converted = convertChatMessage(message({ error: true, content: 'Endpoint unavailable.' }));
    expect(converted.metadata).toEqual({ custom: { error: true, streaming: false } });
    expect(converted.content).toEqual([{ type: 'text', text: 'Endpoint unavailable.' }]);
  });

  it('creates one running synthetic assistant message for the streaming draft', () => {
    expect(
      convertChatMessage(
        message({ id: 'stream-turn-7', content: 'Partial answer', created_at: '' }),
        { streaming: true },
      ),
    ).toMatchObject({
      id: 'stream-turn-7',
      status: { type: 'running' },
      metadata: { custom: { error: false, streaming: true } },
    });
  });

  it('accepts exactly the text parts from a composer submission', () => {
    expect(
      textFromComposerMessage({
        content: [
          { type: 'text', text: 'What time ' },
          { type: 'text', text: 'is it?' },
        ],
      }),
    ).toBe('What time is it?');
  });

  it('rejects a non-text composer payload instead of silently dropping it', () => {
    expect(() =>
      textFromComposerMessage({
        content: [{ type: 'image', image: 'data:image/png;base64,AA==' }],
      }),
    ).toThrow(/text-only/i);
  });
});
