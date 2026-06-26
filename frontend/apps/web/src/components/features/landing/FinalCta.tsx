import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn, buttonVariants } from '../../ui';
import { usePrewarmEngineOnIntent } from '../../../hooks/usePrewarmEngineOnIntent';
import { GITHUB_URL } from './LandingFooter';

/**
 * The closing call — the committing "Draw my chart" CTA (prewarms the engine on
 * intent) plus quieter secondary actions (install as a PWA, view the source).
 */
export function FinalCta(): ReactElement {
  const { t } = useTranslation('landing');
  const prewarm = usePrewarmEngineOnIntent();

  return (
    <section className="relative overflow-hidden py-28" aria-labelledby="finalcta-title">
      {/* A celestial glow to close the page on a high note. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(201,162,75,0.12),transparent_60%)]"
      />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-5 text-center md:px-8">
        <h2
          id="finalcta-title"
          className="max-w-2xl font-display text-4xl font-light leading-tight text-text-primary sm:text-5xl"
        >
          {t('finalCta.title')}
        </h2>

        <Link
          to="/onboarding"
          {...prewarm}
          className={cn(
            buttonVariants({ variant: 'primary', size: 'lg' }),
            'mt-10 px-9 text-base shadow-[0_8px_40px_-8px_rgba(201,162,75,0.55)]',
          )}
          data-testid="final-cta"
        >
          {t('finalCta.cta')}
        </Link>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-text-muted">
          <span className="text-text-secondary">{t('finalCta.installPwa')}</span>
          <span aria-hidden="true" className="text-ui-border">
            &middot;
          </span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="text-text-secondary underline-offset-4 transition-colors hover:text-accent-gold-bright hover:underline"
          >
            {t('finalCta.viewSource')}
          </a>
        </div>
      </div>
    </section>
  );
}
