import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ChatSearch } from '../ChatSearch';
import { useChatStore } from '@almamesh/store';
import {
  __setMemoryForTest,
  __resetMemoryForTest,
  type ChatMemoryFacade,
} from '../../../../lib/chatMemory';

const PROFILE = 'profile-X';

function seedThread(): string {
  const store = useChatStore.getState();
  const tid = store.ensureThread(PROFILE);
  store.appendMessage(tid, 'user', 'What about my career?');
  return tid;
}

function memoryReturning(threadId: string): ChatMemoryFacade {
  return {
    indexMessage: vi.fn().mockResolvedValue(undefined),
    retrieve: vi.fn().mockResolvedValue([
      { text: 'You have strong career yogas', message_id: 'm1', thread_id: threadId, score: 0.91 },
    ]),
  };
}

describe('ChatSearch', () => {
  beforeEach(() => {
    useChatStore.setState({ threads: {}, messages: {} });
    __resetMemoryForTest();
  });

  afterEach(() => {
    useChatStore.setState({ threads: {}, messages: {} });
    __resetMemoryForTest();
    vi.restoreAllMocks();
  });

  it('renders a discoverable search input', () => {
    __setMemoryForTest({ indexMessage: vi.fn(), retrieve: vi.fn().mockResolvedValue([]) });
    render(<ChatSearch profileId={PROFILE} onOpenResult={vi.fn()} />);
    expect(screen.getByTestId('chat-search-input')).toBeTruthy();
  });

  it('shows a result snippet, thread title, and score for a query', async () => {
    const tid = seedThread();
    __setMemoryForTest(memoryReturning(tid));

    render(<ChatSearch profileId={PROFILE} onOpenResult={vi.fn()} />);
    fireEvent.change(screen.getByTestId('chat-search-input'), {
      target: { value: 'career' },
    });

    await waitFor(() => {
      expect(screen.getByText(/You have strong career yogas/)).toBeTruthy();
    });
    // The thread title (derived from the first user message) is shown.
    expect(screen.getByText(/What about my career\?/)).toBeTruthy();
  });

  it('clicking a result calls onOpenResult with the message + thread id', async () => {
    const tid = seedThread();
    __setMemoryForTest(memoryReturning(tid));
    const onOpen = vi.fn();

    render(<ChatSearch profileId={PROFILE} onOpenResult={onOpen} />);
    fireEvent.change(screen.getByTestId('chat-search-input'), {
      target: { value: 'career' },
    });

    await waitFor(() => screen.getByTestId('chat-search-result-m1'));
    fireEvent.click(screen.getByTestId('chat-search-result-m1'));

    expect(onOpen).toHaveBeenCalledWith('m1', tid);
  });

  it('clearing the query removes the results', async () => {
    const tid = seedThread();
    __setMemoryForTest(memoryReturning(tid));

    render(<ChatSearch profileId={PROFILE} onOpenResult={vi.fn()} />);
    const input = screen.getByTestId('chat-search-input');
    fireEvent.change(input, { target: { value: 'career' } });
    await waitFor(() => screen.getByTestId('chat-search-result-m1'));

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.queryByTestId('chat-search-result-m1')).toBeNull();
    });
  });
});
