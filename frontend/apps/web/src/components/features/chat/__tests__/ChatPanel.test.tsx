import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ChatPanel } from '../ChatPanel';
import { useChatStore } from '@almamesh/store';
import { openRouterPreset, writeLlmSettings } from '@almamesh/llm';
import { __setMemoryForTest, __resetMemoryForTest } from '../../../../lib/chatMemory';

/** Configure a synthetic cloud tier so the panel's send affordance is live. */
function configureCloudAi(): void {
  writeLlmSettings(openRouterPreset('sk-or-v1-0000-synthetic-test-key', 'test-org/test-model'));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ChatPanel — typing indicator vs streamed text', () => {
  beforeEach(() => {
    localStorage.clear();
    // These tests exercise the live-send path, which requires a configured AI
    // tier (the panel replaces the input with the Connect-AI CTA otherwise).
    configureCloudAi();
    useChatStore.setState({ threads: {}, messages: {} });
    // Stub memory so no embedder worker boots; retrieve resolves immediately.
    __setMemoryForTest({
      indexMessage: vi.fn().mockResolvedValue(undefined),
      retrieve: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    localStorage.clear();
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
      <MemoryRouter>
        <ChatPanel
          personName="Test"
          profileId="profile-1"
          chartId="chart-1"
          viewMode="layman"
          onAskQuestionStream={onAskQuestionStream as never}
        />
      </MemoryRouter>,
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

  it('renders an error-flagged message as a distinct error bubble (not a normal turn)', async () => {
    const store = useChatStore.getState();
    const threadId = store.ensureThread('profile-1', 'chart-1');
    store.appendMessage(threadId, 'user', 'a very long question');
    store.appendMessage(
      threadId,
      'assistant',
      'That conversation is too long — ask a shorter question.',
      { error: true },
    );

    render(
      <MemoryRouter>
        <ChatPanel
          personName="Test"
          profileId="profile-1"
          chartId="chart-1"
          viewMode="layman"
          onAskQuestionStream={vi.fn() as never}
        />
      </MemoryRouter>,
    );

    const bubble = await screen.findByTestId('chat-error-bubble');
    expect(bubble.textContent).toContain('shorter question');
  });

  it('renders the normal empty state with a usable input (no setup branch)', () => {
    const onAskQuestionStream = vi.fn();
    render(
      <MemoryRouter>
        <ChatPanel
          personName="Test"
          profileId="profile-1"
          chartId="chart-1"
          viewMode="layman"
          onAskQuestionStream={onAskQuestionStream as never}
        />
      </MemoryRouter>,
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

describe('ChatPanel — no-AI-configured gate (never invite a doomed question)', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState({ threads: {}, messages: {} });
    __setMemoryForTest({
      indexMessage: vi.fn().mockResolvedValue(undefined),
      retrieve: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    localStorage.clear();
    useChatStore.setState({ threads: {}, messages: {} });
    __resetMemoryForTest();
    vi.restoreAllMocks();
  });

  it('replaces the send affordance with a Connect-AI CTA when no AI is configured', () => {
    render(
      <MemoryRouter>
        <ChatPanel
          personName="Test"
          profileId="profile-1"
          chartId="chart-1"
          viewMode="layman"
          onAskQuestionStream={vi.fn() as never}
        />
      </MemoryRouter>,
    );

    // No live input/send: a typed question could only fail.
    expect(screen.queryByTestId('chat-input')).toBeNull();
    expect(screen.queryByTestId('chat-send-button')).toBeNull();
    // The existing Connect-AI CTA pattern, pointing at AI settings.
    const link = screen.getByTestId('chat-connect-ai-link');
    expect(link.getAttribute('href')).toBe('/settings/ai');
    expect(screen.getByTestId('chat-connect-ai').textContent ?? '').toContain(
      'Connect an AI model',
    );
  });

  it('a suggested-question chip routes to AI settings instead of submitting a doomed question', async () => {
    const onAskQuestionStream = vi.fn();
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ChatPanel
                personName="Test"
                profileId="profile-1"
                chartId="chart-1"
                viewMode="layman"
                onAskQuestionStream={onAskQuestionStream as never}
              />
            }
          />
          <Route path="/settings/ai" element={<div data-testid="ai-settings-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('What are my career strengths?'));

    expect(await screen.findByTestId('ai-settings-page')).toBeTruthy();
    expect(onAskQuestionStream).not.toHaveBeenCalled();
    // No user turn was persisted for the doomed question.
    expect(Object.keys(useChatStore.getState().messages)).toHaveLength(0);
  });

  it('keeps the live input and send button once an AI tier is configured', () => {
    configureCloudAi();
    render(
      <MemoryRouter>
        <ChatPanel
          personName="Test"
          profileId="profile-1"
          chartId="chart-1"
          viewMode="layman"
          onAskQuestionStream={vi.fn() as never}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('chat-connect-ai')).toBeNull();
    expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).disabled).toBe(false);
  });
});
