import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, Button, cn } from '../../ui';
import { submitFeedback, type FeedbackSentiment } from '../../../lib/submitFeedback';

/**
 * FeedbackWidget — a quiet, ANONYMOUS product-feedback prompt.
 *
 * It asks one small question ("Was this helpful?" 👍/👎) plus an optional
 * "what's missing?" note, then POSTs a no-identity payload to the `/api/feedback`
 * Cloudflare Pages Function. In keeping with the rest of AlmaMesh there is no
 * account, no cookie, no tracking — the only device-local state is a localStorage
 * "dismissed" flag so a returning visitor is never nagged twice on this surface.
 *
 * Bot protection is Cloudflare Turnstile, rendered only when a site key is
 * configured (`VITE_TURNSTILE_SITE_KEY`). With no key (local dev / tests) the
 * widget still works and sends the `'dev'` token the function tolerates. The
 * Turnstile script is loaded lazily, once, and fails soft so it never blocks
 * render or breaks offline.
 */

const DISMISS_KEY_PREFIX = 'almamesh-feedback-dismissed-v1';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_ACTION = 'turnstile-spin-v1';

/** The per-surface localStorage key guarding against re-prompting on this device. */
export function feedbackDismissedKey(page: string): string {
  return `${DISMISS_KEY_PREFIX}:${page}`;
}

function readDismissed(page: string): boolean {
  try {
    return localStorage.getItem(feedbackDismissedKey(page)) !== null;
  } catch {
    return false;
  }
}

function persistDismissed(page: string): void {
  try {
    localStorage.setItem(feedbackDismissedKey(page), '1');
  } catch {
    // Private-mode / disabled storage: degrade to nagging again, never crash.
  }
}

// --- Turnstile (lazy, once, fail-soft) ---------------------------------------

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile ?? null);
    script.onerror = () => resolve(null); // offline / blocked — fail soft
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

function readTurnstileSiteKey(): string | undefined {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return env.VITE_TURNSTILE_SITE_KEY;
}

type Status = 'idle' | 'submitting' | 'thanks' | 'error';

export interface FeedbackWidgetProps {
  /** Stable identifier for the surface (e.g. 'dashboard'). */
  page: string;
  className?: string;
}

export function FeedbackWidget({ page, className }: FeedbackWidgetProps) {
  const { t } = useTranslation('feedback');
  const [dismissed, setDismissed] = useState(() => readDismissed(page));
  const [sentiment, setSentiment] = useState<FeedbackSentiment>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const siteKey = readTurnstileSiteKey();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);

  // Render the Turnstile widget only when a site key is configured. Lazy-loaded,
  // fail-soft, and cleaned up on unmount.
  useEffect(() => {
    if (!siteKey || !turnstileRef.current) return;
    const container = turnstileRef.current;
    let widgetId: string | undefined;
    let cancelled = false;
    void loadTurnstile().then((api) => {
      if (!api || cancelled) return;
      widgetId = api.render(container, {
        sitekey: siteKey,
        action: TURNSTILE_ACTION,
        callback: (token) => setTurnstileToken(token),
        'error-callback': () => setTurnstileToken(null),
        'expired-callback': () => setTurnstileToken(null),
      });
    });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (dismissed) return null;

  const trimmed = message.trim();
  const canSend = (sentiment !== null || trimmed.length > 0) && status !== 'submitting';

  const dismiss = () => {
    persistDismissed(page);
    setDismissed(true);
  };

  const handleSend = async () => {
    setStatus('submitting');
    const result = await submitFeedback({
      page,
      sentiment,
      message: trimmed.length > 0 ? trimmed : null,
      turnstileToken: siteKey ? (turnstileToken ?? '') : 'dev',
    });
    if (result.ok) {
      persistDismissed(page);
      setStatus('thanks');
    } else {
      setStatus('error');
    }
  };

  return (
    <Card
      className={cn('border-ui-border/70 bg-background-secondary/60', className)}
      data-testid="feedback-widget"
    >
      {status === 'thanks' ? (
        <ThankYou title={t('thanks_title')} body={t('thanks_body')} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="font-display text-base text-text-primary">{t('title')}</h3>
            <p className="text-sm text-text-secondary">{t('subtitle')}</p>
          </div>

          <div className="flex items-center gap-2" role="group" aria-label={t('title')}>
            <SentimentButton
              testId="feedback-up"
              label={t('helpful_yes')}
              selected={sentiment === 'up'}
              onClick={() => setSentiment(sentiment === 'up' ? null : 'up')}
            >
              <span aria-hidden="true">👍</span>
            </SentimentButton>
            <SentimentButton
              testId="feedback-down"
              label={t('helpful_no')}
              selected={sentiment === 'down'}
              onClick={() => setSentiment(sentiment === 'down' ? null : 'down')}
            >
              <span aria-hidden="true">👎</span>
            </SentimentButton>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-message" className="block text-sm text-text-secondary">
              {t('message_label')}
            </label>
            <textarea
              id="feedback-message"
              data-testid="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t('message_placeholder')}
              className={cn(
                'w-full rounded-md border border-ui-border bg-background-darker px-3 py-2',
                'font-sans text-sm text-text-primary placeholder:text-text-muted',
                'transition-colors duration-200 ease-orbital resize-none',
                'focus-visible:outline-none focus-visible:border-accent-gold/60',
                'focus-visible:ring-2 focus-visible:ring-ui-focus/40',
              )}
            />
          </div>

          {siteKey && <div ref={turnstileRef} data-action={TURNSTILE_ACTION} className="min-h-[1px]" />}

          <p className="text-xs text-text-tertiary" data-testid="feedback-anonymous-note">
            {t('anonymous_note')}
          </p>

          {status === 'error' && (
            <p className="text-sm text-status-error" data-testid="feedback-error">
              {t('error')}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              data-testid="feedback-send"
              disabled={!canSend}
              onClick={() => void handleSend()}
            >
              {status === 'submitting'
                ? t('sending')
                : status === 'error'
                  ? t('retry')
                  : t('send')}
            </Button>
            <button
              type="button"
              data-testid="feedback-dismiss"
              onClick={dismiss}
              className="text-xs text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
            >
              {t('dismiss')}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ThankYou({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1" data-testid="feedback-thanks">
      <h3 className="font-display text-base text-accent-gold">{title}</h3>
      <p className="text-sm text-text-secondary">{body}</p>
    </div>
  );
}

interface SentimentButtonProps {
  testId: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

function SentimentButton({ testId, label, selected, onClick, children }: SentimentButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
        'transition-colors duration-200 ease-orbital',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus/40',
        selected
          ? 'border-accent-gold/60 bg-accent-gold/10 text-text-primary'
          : 'border-ui-border bg-background-darker text-text-secondary hover:border-accent-gold/40 hover:text-text-primary',
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
