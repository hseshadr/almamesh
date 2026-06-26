import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Why I built this — the founder's note. A deliberately quieter, narrower column
 * with a manuscript treatment, set apart from the marketing voice. The paragraphs
 * and signature are the spec's approved copy, rendered VERBATIM from i18n.
 */
export function FounderNote(): ReactElement {
  const { t } = useTranslation('landing');
  const paragraphs = t('founder.body', { returnObjects: true }) as string[];

  return (
    <section className="relative pt-20 pb-28" aria-labelledby="founder-title">
      {/* A still, narrow column — no force-field, no glow; the page exhales here. */}
      <div className="mx-auto w-full max-w-2xl px-5 md:px-8">
        <p className="mb-3 text-center text-xs uppercase tracking-[0.24em] text-accent-gold/70">
          06 — A note from the maker
        </p>
        <h2
          id="founder-title"
          className="text-center font-display text-3xl font-light italic text-text-primary sm:text-4xl"
        >
          {t('founder.title')}
        </h2>

        <div className="mt-12 space-y-6">
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-lg leading-loose text-text-secondary">
              {paragraph}
            </p>
          ))}
        </div>

        <p className="mt-10 font-display text-2xl italic text-accent-gold" data-testid="founder-signature">
          {t('founder.signature')}
        </p>
      </div>
    </section>
  );
}
