import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPanel } from '../ChatPanel';
import { useChatStore } from '@almamesh/store';
import { __setMemoryForTest, __resetMemoryForTest } from '../../../../lib/chatMemory';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ChatPanel — typing indicator vs streamed text', () => {
  beforeEach(() => {
    useChatStore.setState({ threads: {}, messages: {} });
    // Stub memory so no embedder worker boots; retrieve resolves immediately.
    __setMemoryForTest({
      indexMessage: vi.fn().mockResolvedValue(undefined),
      retrieve: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    useChatStore.setState({ threads: {}, messages: {} });
    __resetMemoryForTest();
    vi.restoreAllMocks();
  });

  it('shows the typing indicator until the first token, then yields to the streamed answer', async () => {
    let onToken: ((t: string) => void) | null = null;
    const done = deferred<{ answer: string }>();
    const onAskQuestionStream = vi.fn((_q: string, cb: (t: string) => void) => {
      onToken = cb;
      return done.promise;
    });

    render(
      <ChatPanel
        personName="Test"
        profileId="profile-1"
        chartId="chart-1"
        viewMode="layman"
        onAskQuestionStream={onAskQuestionStream as never}
      />,
    );

    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'What is my Mars placement?' },
    });
    fireEvent.click(screen.getByTestId('chat-send-button'));

    // Awaiting the first token (incl. any retrieval/tool pause): the typing
    // indicator is visible and no answer text has rendered yet.
    expect(await screen.findByTestId('chat-loading')).toBeTruthy();
    expect(screen.getByTestId('chat-panel').textContent).not.toContain('exalted in Capricorn');

    // First streamed token arrives.
    act(() => onToken?.('Your Mars is exalted in Capricorn.'));
    await waitFor(() =>
      expect(screen.getByTestId('chat-panel').textContent).toContain('exalted in Capricorn'),
    );

    // The typing indicator yields to the streaming text.
    expect(screen.queryByTestId('chat-loading')).toBeNull();

    act(() => done.resolve({ answer: 'Your Mars is exalted in Capricorn.' }));
    await waitFor(() => expect(onAskQuestionStream).toHaveBeenCalledTimes(1));

    // Persisted: the conversation survives because it lives in the chat store.
    await waitFor(() => {
      const threadIds = Object.keys(useChatStore.getState().messages);
      expect(threadIds.length).toBe(1);
      const msgs = useChatStore.getState().messages[threadIds[0]];
      expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    });
  });

  it('renders the normal empty state with a usable input (no setup branch)', () => {
    const onAskQuestionStream = vi.fn();
    render(
      <ChatPanel
        personName="Test"
        profileId="profile-1"
        chartId="chart-1"
        viewMode="layman"
        onAskQuestionStream={onAskQuestionStream as never}
      />,
    );

    // The normal empty state (not the removed setup card) is shown.
    expect(screen.queryByTestId('chat-setup')).toBeNull();
    // Search is reachable and the input is enabled with the normal placeholder.
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toBe('Ask a question about your chart...');
    // Send button is disabled only because the input is empty (not by setup).
    expect((screen.getByTestId('chat-send-button') as HTMLButtonElement).disabled).toBe(true);
  });
});
