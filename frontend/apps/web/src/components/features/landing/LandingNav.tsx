import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguageStore, type Language } from '@almamesh/store';
import { Select, buttonVariants, cn } from '../../ui';
import { useChartCta } from '../../../hooks/useChartCta';
import { GITHUB_URL, GithubMark } from './LandingFooter';

/**
 * The marketing splash's own minimal top bar — wordmark, an unmissable
 * open-source GitHub link, the language switcher and the single primary CTA.
 * Deliberately NOT `AppLayout` (no profile switcher / AI-status chrome): the
 * landing renders outside the app shell.
 *
 * The CTA is adaptive (`useChartCta`): a first-time visitor gets "Generate my
 * chart" → onboarding (carrying the engine-prewarm intent handlers so the ~38 MB
 * engine starts syncing on hover / focus / click); a returning visitor with a
 * saved chart gets "Open my chart" → straight to the dashboard, no prewarm.
 */
export function LandingNav(): ReactElement {
  const { t } = useTranslation('landing');
  const { to, labelKey, intentProps } = useChartCta();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <header className="sticky top-0 z-50 border-b border-ui-border/60 bg-background-primary/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
        <Link
          to="/welcome"
          className="font-display text-xl tracking-tight text-text-primary transition-colors hover:text-accent-gold-bright sm:text-2xl"
          aria-label="AlmaMesh"
        >
          Alma<span className="text-accent-gold">Mesh</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={t('nav.github')}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ui-border/60 px-2.5 text-sm text-text-secondary transition-colors hover:border-accent-gold/60 hover:text-accent-gold-bright sm:px-3"
            data-testid="landing-nav-github"
          >
            <GithubMark className="h-4 w-4" />
            <span className="hidden sm:inline">{t('nav.github')}</span>
          </a>
          <Select
            aria-label={t('nav.languageLabel')}
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="h-9 w-auto min-w-0 border-ui-border/60 bg-transparent text-text-secondary"
            data-testid="landing-language-select"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
          </Select>

          <Link
            to={to}
            {...intentProps}
            className={cn(buttonVariants({ variant: 'primary', size: 'md' }), 'whitespace-nowrap')}
            data-testid="landing-nav-cta"
          >
            {t(`nav.${labelKey}`)}
          </Link>
        </div>
      </nav>
    </header>
  );
}
