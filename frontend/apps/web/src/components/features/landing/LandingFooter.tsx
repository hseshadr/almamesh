import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguageStore, type Language } from '@almamesh/store';
import { Select } from '../../ui';

/** Canonical public source repository. */
export const GITHUB_URL = 'https://github.com/hseshadr/almamesh';

/**
 * The splash footer — one honest line, the legal/source links, and the language
 * switcher (mirroring the nav so a visitor who scrolled can still re-language).
 */
export function LandingFooter(): ReactElement {
  const { t } = useTranslation('landing');
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <footer className="border-t border-ui-border/60 bg-background-darker">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <p className="font-display text-lg text-text-primary">
              Alma<span className="text-accent-gold">Mesh</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">{t('footer.tagline')}</p>
          </div>

          <nav
            aria-label={t('footer.tagline')}
            className="flex flex-col gap-3 text-sm text-text-secondary"
          >
            <Link to="/privacy" className="transition-colors hover:text-accent-gold-bright">
              {t('footer.privacy')}
            </Link>
            <Link to="/terms" className="transition-colors hover:text-accent-gold-bright">
              {t('footer.terms')}
            </Link>
            <Link to="/data-deletion" className="transition-colors hover:text-accent-gold-bright">
              {t('footer.dataDeletion')}
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-accent-gold-bright"
            >
              {t('footer.github')}
            </a>
          </nav>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="landing-footer-language"
              className="text-xs uppercase tracking-[0.2em] text-text-muted"
            >
              {t('nav.languageLabel')}
            </label>
            <Select
              id="landing-footer-language"
              aria-label={t('nav.languageLabel')}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="w-auto min-w-[9rem]"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="pt">Português</option>
            </Select>
          </div>
        </div>

        <div className="mt-10 border-t border-ui-border/40 pt-6 text-xs text-text-muted">
          <span>&copy; {new Date().getFullYear()} AlmaMesh</span>
        </div>
      </div>
    </footer>
  );
}
