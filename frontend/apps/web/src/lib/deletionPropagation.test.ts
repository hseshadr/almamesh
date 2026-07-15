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
});
