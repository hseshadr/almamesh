import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLlmStatus } from '../../../hooks/useLlmStatus';

/**
 * AiStatusBadge — the header's live AI-provider indicator and entry point.
 *
 * Replaces the old hardcoded "AI: local" placeholder. It reflects the saved
 * provider (OpenRouter / Local / Cloud / not set) from `describeLlmStatus()` and
 * is a link straight to the AI Model settings — so configuring (e.g. selecting
 * OpenRouter) is always one click from anywhere in the app. A not-yet-configured
 * state reads as a gentle call-to-action ("Set up AI") rather than a dead label.
 */
export function AiStatusBadge() {
  const { t } = useTranslation('common');
  // Live status: flips the instant AI is saved/turned off on the Settings screen
  // (same-tab), on cross-tab writes, and on focus. See useLlmStatus.
  const status = useLlmStatus();

  const ready = status.configured;
  // Provider names (OpenRouter/Local/Cloud) read fine as-is.
  const provider = status.label;
  const label =
    status.kind === 'none'
      ? t('ai_badge.setup')
      : t('ai_badge.label', { provider });
  const title = ready
    ? t('ai_badge.title_ready', { provider })
    : status.kind === 'none'
      ? t('ai_badge.title_setup')
      : t('ai_badge.title_finish', { provider });

  return (
    <Link
      to="/settings/ai"
      title={title}
      // Mobile hides the text span (icon-only dot) — the link keeps an
      // accessible name for screen readers regardless of viewport.
      aria-label={label}
      data-testid="ai-status-badge"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        ready
          ? 'border-status-success/40 bg-status-success/10 text-status-success hover:bg-status-success/20'
          : 'border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-status-success' : 'bg-amber-400'}`}
      />
      <span className="hidden truncate sm:inline">{label}</span>
    </Link>
  );
}

export default AiStatusBadge;
