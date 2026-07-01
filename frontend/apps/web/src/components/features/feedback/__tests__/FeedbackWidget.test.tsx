import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import i18n from '../../../../i18n/config';
import { FeedbackWidget, feedbackDismissedKey } from '../FeedbackWidget';
import { submitFeedback } from '../../../../lib/submitFeedback';

// The POST client is mocked: this test owns the widget's behavior, not the network.
vi.mock('../../../../lib/submitFeedback', () => ({
  submitFeedback: vi.fn(),
}));

const submitMock = vi.mocked(submitFeedback);
const PAGE = 'dashboard';
const KEY = feedbackDismissedKey(PAGE);

describe('FeedbackWidget', () => {
  beforeEach(async () => {
    localStorage.clear();
    submitMock.mockReset();
    submitMock.mockResolvedValue({ ok: true });
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders the prompt, both thumbs, an optional note field, send, and an anonymity line', () => {
    render(<FeedbackWidget page={PAGE} />);

    expect(screen.getByTestId('feedback-widget')).toBeTruthy();
    expect(screen.getByTestId('feedback-up')).toBeTruthy();
    expect(screen.getByTestId('feedback-down')).toBeTruthy();
    expect(screen.getByTestId('feedback-message')).toBeTruthy();
    expect(screen.getByTestId('feedback-send')).toBeTruthy();
    // The anti-tracking promise is explicit on screen.
    expect(screen.getByTestId('feedback-anonymous-note').textContent?.toLowerCase()).toContain(
      'anonymous',
    );
  });

  it('does not render when the dismiss guard is already set for this surface', () => {
    localStorage.setItem(KEY, '1');
    render(<FeedbackWidget page={PAGE} />);
    expect(screen.queryByTestId('feedback-widget')).toBeNull();
  });

  it('Send is disabled until a sentiment is picked or a note is typed', () => {
    render(<FeedbackWidget page={PAGE} />);
    expect((screen.getByTestId('feedback-send') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('feedback-up'));
    expect((screen.getByTestId('feedback-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits the contract payload, thanks the user, and sets the dismiss guard', async () => {
    render(<FeedbackWidget page={PAGE} />);

    fireEvent.click(screen.getByTestId('feedback-up'));
    fireEvent.change(screen.getByTestId('feedback-message'), {
      target: { value: '  more divisional charts  ' },
    });
    fireEvent.click(screen.getByTestId('feedback-send'));

    await screen.findByTestId('feedback-thanks');

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith({
      page: 'dashboard',
      sentiment: 'up',
      message: 'more divisional charts',
      turnstileToken: 'dev',
    });
    // After a thank-you, this device should not be nagged again.
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it('sends a null message when only a thumbs-down is given', async () => {
    render(<FeedbackWidget page={PAGE} />);

    fireEvent.click(screen.getByTestId('feedback-down'));
    fireEvent.click(screen.getByTestId('feedback-send'));

    await screen.findByTestId('feedback-thanks');
    expect(submitMock).toHaveBeenCalledWith({
      page: 'dashboard',
      sentiment: 'down',
      message: null,
      turnstileToken: 'dev',
    });
  });

  it('shows an inline error with retry on failure and does NOT set the guard', async () => {
    submitMock.mockResolvedValueOnce({ ok: false, status: 429, reason: 'rate_limited' });
    render(<FeedbackWidget page={PAGE} />);

    fireEvent.click(screen.getByTestId('feedback-up'));
    fireEvent.click(screen.getByTestId('feedback-send'));

    await screen.findByTestId('feedback-error');
    expect(localStorage.getItem(KEY)).toBeNull();

    // Retrying succeeds and reaches the thank-you state.
    submitMock.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByTestId('feedback-send'));
    await screen.findByTestId('feedback-thanks');
    expect(submitMock).toHaveBeenCalledTimes(2);
  });

  it('dismissing with "Not now" hides the widget and sets the guard without submitting', async () => {
    render(<FeedbackWidget page={PAGE} />);

    fireEvent.click(screen.getByTestId('feedback-dismiss'));

    await waitFor(() => expect(screen.queryByTestId('feedback-widget')).toBeNull());
    expect(submitMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });
});
