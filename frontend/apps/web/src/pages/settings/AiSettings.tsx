/**
 * AiSettings — the dedicated "AI Model" settings tab.
 *
 * Home of the OpenRouter / bring-your-own-endpoint configuration. It used to be
 * buried inside the "Preferences" tab (undiscoverable), which is why users could
 * not find where to select OpenRouter. It now has its own clearly-labeled tab and
 * is linked from the header AI-status badge.
 */

import { useTranslation } from 'react-i18next';
import { AiModelSettings } from '../../components/features/settings/AiModelSettings';

export default function AiSettings() {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="border-b border-ui-border pb-4">
        <h2 className="text-xl font-semibold text-text-primary">{t('ai.title')}</h2>
        <p className="text-text-secondary text-sm mt-1">{t('ai.description')}</p>
      </div>

      <AiModelSettings />

      {/* Info Box */}
      <div className="flex items-start gap-3 p-4 bg-background-tertiary border border-ui-border rounded-lg">
        <svg
          className="h-5 w-5 text-accent-gold flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <p className="text-text-primary font-medium text-sm">{t('ai.info_title')}</p>
          <p className="text-text-secondary text-sm mt-1">{t('ai.info_description')}</p>
        </div>
      </div>
    </div>
  );
}
