import { describe, expect, it, vi } from 'vitest';

import { createDeletionPropagation, type DeletionChannel } from './deletionPropagation';

describe('deletion propagation', () => {
  it('publishes typed notices and delivers remote messages until unsubscribed', () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const channel: DeletionChannel = {
      postMessage: vi.fn(),
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    const propagation = createDeletionPropagation(channel);
    const listener = vi.fn();
    const unsubscribe = propagation.subscribe(listener);
    const notice = { kind: 'thread', threadId: 'thread-1' } as const;

    propagation.publish(notice);
    for (const deliver of listeners) {
      deliver(new MessageEvent('message', { data: notice }));
    }

    expect(channel.postMessage).toHaveBeenCalledWith(notice);
    expect(listener).toHaveBeenCalledWith(notice);
    unsubscribe();
    expect(listeners).toHaveLength(0);
  });

  it('ignores malformed cross-realm messages instead of treating them as deletion commands', () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const channel: DeletionChannel = {
      postMessage: vi.fn(),
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    const listener = vi.fn();
    createDeletionPropagation(channel).subscribe(listener);

    const malformed = [
      null,
      { kind: 'profile', profileId: 'profile-1', chartIds: 'chart-1', threadIds: [] },
      { kind: 'thread' },
      { kind: 'dataset', operation: 'erase-everything' },
      { kind: 'dataset', operation: 'reset', phase: 'unknown' },
    ];
    for (const data of malformed) {
      for (const deliver of listeners) deliver(new MessageEvent('message', { data }));
    }

    expect(listener).not.toHaveBeenCalled();
  });
});
