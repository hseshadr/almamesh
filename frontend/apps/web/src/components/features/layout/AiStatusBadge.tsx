import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { describeLlmStatus, type LlmStatus } from '@almamesh/llm';

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
  const [status, setStatus] = useState<LlmStatus>(() => describeLlmStatus());

  // Refresh on cross-tab storage writes and when the tab regains focus, so the
  // badge stays honest after the user saves settings elsewhere.
  useEffect(() => {
    const refresh = () => setStatus(describeLlmStatus());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const ready = status.configured;
  // Provider names (OpenRouter/Local/Cloud) read fine as-is; the on-device
  // tier's label is a real phrase, so it is translated (Spec 063).
  const provider = status.kind === 'on_device' ? t('ai_badge.on_device') : status.label;
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
      data-testid="ai-status-badge"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        ready
          ? 'border-accent-gold/30 bg-accent-gold/10 text-accent-gold hover:bg-accent-gold/20'
          : 'border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-accent-gold' : 'bg-amber-400'}`}
      />
      <span className="hidden truncate sm:inline">{label}</span>
    </Link>
  );
}

export default AiStatusBadge;
