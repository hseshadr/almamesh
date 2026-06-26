import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

interface HowStep {
  readonly title: string;
  readonly body: string;
}

/**
 * HOW it works — three honest steps (enter details → compute locally → explore),
 * closed by the load-bearing zero-egress note: the chart engine makes no network
 * calls; the optional AI only narrates.
 */
export function HowItWorksSection(): ReactElement {
  const { t } = useTranslation('landing');
  const steps = t('how.steps', { returnObjects: true }) as HowStep[];

  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-24 md:px-8" aria-labelledby="how-title">
      <div className="mb-14 max-w-2xl">
        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-accent-gold">04 — The flow</p>
        <h2
          id="how-title"
          className="font-display text-3xl font-light leading-tight text-text-primary sm:text-4xl"
        >
          {t('how.title')}
        </h2>
      </div>

      <ol className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="relative">
            <div
              aria-hidden="true"
              className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-accent-gold/40 font-display text-xl text-accent-gold"
            >
              {i + 1}
            </div>
            {/* Connecting line between steps on desktop. */}
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-12 top-6 hidden h-px w-[calc(100%-3rem)] bg-gradient-to-r from-accent-gold/30 to-transparent md:block"
              />
            )}
            <h3 className="font-display text-xl text-text-primary">{step.title}</h3>
            <p className="mt-3 text-base leading-relaxed text-text-secondary">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-14 flex items-start gap-3 rounded-xl border border-accent-lapis/30 bg-accent-lapis/5 p-5 text-sm leading-relaxed text-text-secondary">
        <span aria-hidden="true" className="mt-0.5 text-accent-gold">
          &#9679;
        </span>
        {t('how.zeroEgress')}
      </p>
    </section>
  );
}
