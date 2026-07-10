import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import i18n from '../../../../i18n/config';
import { FeedbackWidget } from '../FeedbackWidget';
import { submitFeedback } from '../../../../lib/submitFeedback';

// The POST client is mocked: this test owns the widget's behavior, not the network.
vi.mock('../../../../lib/submitFeedback', () => ({
  submitFeedback: vi.fn(),
}));

const submitMock = vi.mocked(submitFeedback);
const PAGE = 'dashboard';

/** Open the modal from its trigger button and wait for the form to mount. */
async function openForm() {
  fireEvent.click(screen.getByTestId('feedback-open'));
  await screen.findByTestId('feedback-widget');
}

describe('FeedbackWidget — re-openable, ongoing', () => {
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

  it('shows only a trigger button until opened — no form on the page yet', () => {
    render(<FeedbackWidget page={PAGE} />);
    expect(screen.getByTestId('feedback-open')).toBeTruthy();
    expect(screen.queryByTestId('feedback-widget')).toBeNull();
  });

  it('opens a dialog with both thumbs, an optional note, send, and an anonymity line', async () => {
    render(<FeedbackWidget page={PAGE} />);
    await openForm();

    expect(screen.getByTestId('feedback-up')).toBeTruthy();
    expect(screen.getByTestId('feedback-down')).toBeTruthy();
    expect(screen.getByTestId('feedback-message')).toBeTruthy();
    expect(screen.getByTestId('feedback-send')).toBeTruthy();
    expect(screen.getByTestId('feedback-anonymous-note').textContent?.toLowerCase()).toContain(
      'anonymous',
    );
  });

  it('Send is disabled until a sentiment is picked or a note is typed', async () => {
    render(<FeedbackWidget page={PAGE} />);
    await openForm();

    expect((screen.getByTestId('feedback-send') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('feedback-up'));
    expect((screen.getByTestId('feedback-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits the exact contract payload and thanks the user', async () => {
    render(<FeedbackWidget page={PAGE} />);
    await openForm();

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
  });

  it('is ONGOING: "Send more" resets to a fresh form and a second submit reaches D1 again', async () => {
    // Cooldown 0 so "Send more" is immediately available in the test.
    render(<FeedbackWidget page={PAGE} cooldownMs={0} />);
    await openForm();

    fireEvent.click(screen.getByTestId('feedback-down'));
    fireEvent.click(screen.getByTestId('feedback-send'));
    await screen.findByTestId('feedback-thanks');

    // The cooldown lapses (0ms) → "Send more" enables → back to a fresh form.
    await waitFor(() =>
      expect((screen.getByTestId('feedback-send-more') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId('feedback-send-more'));

    // Fresh form: nothing preselected, so Send is disabled again.
    expect((screen.getByTestId('feedback-send') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('feedback-up'));
    fireEvent.click(screen.getByTestId('feedback-send'));
    await screen.findByTestId('feedback-thanks');

    // TWO independent submissions — each its own D1 row.
    expect(submitMock).toHaveBeenCalledTimes(2);
  });

  it('gates "Send more" during the post-submit cooldown (anti-spam)', async () => {
    render(<FeedbackWidget page={PAGE} cooldownMs={10_000} />);
    await openForm();

    fireEvent.click(screen.getByTestId('feedback-up'));
    fireEvent.click(screen.getByTestId('feedback-send'));
    await screen.findByTestId('feedback-thanks');

    // While cooling down, re-sending is blocked and the user is told why.
    expect((screen.getByTestId('feedback-send-more') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('feedback-cooldown')).toBeTruthy();
  });

  it('sends a null message when only a thumbs-down is given', async () => {
    render(<FeedbackWidget page={PAGE} />);
    await openForm();

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

  it('shows a reason-SPECIFIC error (429 → slow down, not a generic retry-into-the-wall)', async () => {
    submitMock.mockResolvedValueOnce({ ok: false, status: 429, reason: 'rate_limited' });
    render(<FeedbackWidget page={PAGE} />);
    await openForm();

    fireEvent.click(screen.getByTestId('feedback-up'));
    fireEvent.click(screen.getByTestId('feedback-send'));
    const err = await screen.findByTestId('feedback-error');
    expect(err.textContent?.toLowerCase()).toContain('fast');

    // Retrying succeeds and reaches the thank-you state.
    submitMock.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByTestId('feedback-send'));
    await screen.findByTestId('feedback-thanks');
    expect(submitMock).toHaveBeenCalledTimes(2);
  });

  it('maps a 403 to a verification message (distinct from the generic error)', async () => {
    submitMock.mockResolvedValueOnce({ ok: false, status: 403, reason: 'forbidden' });
    render(<FeedbackWidget page={PAGE} />);
    await openForm();

    fireEvent.click(screen.getByTestId('feedback-down'));
    fireEvent.click(screen.getByTestId('feedback-send'));
    const err = await screen.findByTestId('feedback-error');
    expect(err.textContent?.toLowerCase()).toContain('verify');
  });

  it('closing the dialog does NOT permanently dismiss it — it re-opens fresh', async () => {
    render(<FeedbackWidget page={PAGE} />);
    await openForm();

    fireEvent.click(screen.getByTestId('feedback-close'));
    await waitFor(() => expect(screen.queryByTestId('feedback-widget')).toBeNull());
    expect(submitMock).not.toHaveBeenCalled();

    // The trigger is still there and re-opens a clean form (no one-time lock).
    await openForm();
    expect((screen.getByTestId('feedback-send') as HTMLButtonElement).disabled).toBe(true);
  });
});
