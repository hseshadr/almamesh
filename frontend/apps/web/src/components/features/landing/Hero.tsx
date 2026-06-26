import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn, buttonVariants } from '../../ui';
import { usePrewarmEngineOnIntent } from '../../../hooks/usePrewarmEngineOnIntent';
import { HeroForceField } from './HeroForceField';

/**
 * Above-the-fold hero: the approved headline + subhead + the single committing
 * CTA, set over the signature force-field (static fixture, no engine). The text
 * paints immediately; the WebGL scene hydrates lazily behind it.
 */
export function Hero(): ReactElement {
  const { t } = useTranslation('landing');
  const prewarm = usePrewarmEngineOnIntent();

  return (
    <section className="relative isolate overflow-hidden">
      {/* Decorative force-field backdrop (engine-free, aria-hidden). */}
      <HeroForceField />

      {/* Soft vignette so the headline stays legible over the scene. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background-primary/40 via-background-primary/10 to-background-primary"
      />

      <div className="relative mx-auto flex min-h-[88vh] w-full max-w-5xl flex-col items-center justify-center px-5 py-24 text-center md:px-8">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/5 px-4 py-1.5 text-xs uppercase tracking-[0.22em] text-accent-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-gold" aria-hidden="true" />
          {t('hero.microcopy')}
        </p>

        <h1 className="max-w-4xl font-display text-4xl font-light leading-[1.08] tracking-tight text-text-primary sm:text-5xl md:text-6xl lg:text-7xl">
          {t('hero.headline')}
        </h1>

        <p className="mt-7 max-w-2xl text-base leading-relaxed text-text-secondary sm:text-lg">
          {t('hero.subhead')}
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <Link
            to="/onboarding"
            {...prewarm}
            className={cn(
              buttonVariants({ variant: 'primary', size: 'lg' }),
              'px-8 text-base shadow-[0_8px_40px_-8px_rgba(201,162,75,0.55)]',
            )}
            data-testid="hero-cta"
          >
            {t('hero.cta')}
          </Link>
        </div>
      </div>

      {/* Fade the hero into the next section. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background-primary"
      />
    </section>
  );
}
