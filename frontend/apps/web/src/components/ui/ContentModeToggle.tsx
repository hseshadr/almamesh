/**
 * ContentModeToggle - Global toggle for interpretation content mode
 *
 * Segmented control that switches between "For You" (layman) and
 * "For Astrologer" (technical) modes across all interpretation sections.
 */

import { useTranslation } from 'react-i18next';
import { useContentModeStore } from '../../stores/contentMode';

interface ContentModeToggleProps {
  className?: string;
}

export function ContentModeToggle({ className = '' }: ContentModeToggleProps) {
  const { t } = useTranslation();
  const { contentMode, setContentMode } = useContentModeStore();

  return (
    <div
      className={`flex gap-1 p-1 bg-background-tertiary rounded-lg w-fit ${className}`}
      role="tablist"
      aria-label={t('content_mode.aria')}
      data-testid="content-mode-toggle"
    >
      <button
        role="tab"
        aria-selected={contentMode === 'layman'}
        onClick={() => setContentMode('layman')}
        data-testid="layman-tab"
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          contentMode === 'layman'
            ? 'bg-accent-gold text-background-primary'
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        {t('content_mode.for_you')}
      </button>

      <button
        role="tab"
        aria-selected={contentMode === 'technical'}
        onClick={() => setContentMode('technical')}
        data-testid="astrologer-tab"
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          contentMode === 'technical'
            ? 'bg-accent-gold text-background-primary'
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        {t('content_mode.for_astrologer')}
      </button>
    </div>
  );
}

export default ContentModeToggle;
