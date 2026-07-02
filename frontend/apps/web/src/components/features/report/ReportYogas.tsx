/**
 * ReportYogas — the integrated yoga narrative + the calculated yoga list.
 *
 * The narrative is the audience-resolved `integrated_yoga_narrative` persona
 * (LLM prose). The list is the engine's own formed yogas (calculation
 * integrity): the `display_name`, the qualitative grade as a small-caps
 * typographic mark (the engine emits NO numeric strength), the short
 * description, and a one-line formation basis with its classical citation —
 * every word the engine's verbatim.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { YogaData } from '@almamesh/browser/types';
import type { VedicInterpretation } from '@almamesh/shared-types';
import { personaText, type ReportAudience } from '../../../lib/reportSelectors';
import { ReportProse } from './ReportProse';
import { ReportSectionHeading } from './ReportSectionHeading';

interface ReportYogasProps {
  readonly yogas: readonly YogaData[];
  /**
   * OPTIONAL: the LLM narrative. When the interpretation has not been generated
   * yet, the section degrades to the engine's deterministic formed-yoga registry
   * (no prose) rather than disappearing.
   */
  readonly interpretation?: VedicInterpretation;
  readonly audience: ReportAudience;
}

/** Yoga section: the narrative (if any) + the engine's formed-yoga registry. */
export function ReportYogas({ yogas, interpretation, audience }: ReportYogasProps): ReactElement | null {
  const { t } = useTranslation('report');
  const narrative = interpretation
    ? personaText(interpretation.integrated_yoga_narrative, audience)
    : '';

  if (!narrative && yogas.length === 0) {
    return null;
  }

  return (
    <section className="report-section" data-testid="report-yogas">
      <ReportSectionHeading index="IV" title={t('yogas.heading')} />

      {narrative ? (
        <ReportProse
          text={narrative}
          className="report-avoid-break"
          testid="report-yoga-narrative"
        />
      ) : null}

      {yogas.length > 0 ? (
        <ul className="report-yoga-list">
          {yogas.map((yoga) => {
            // The first formation rule is the engine's own one-line basis;
            // min-length-1 by schema, guarded for older stored payloads.
            const basis = yoga.formation_rules[0];
            return (
              <li
                key={`${yoga.name}-${yoga.planetary_signature}`}
                className="report-yoga-item report-avoid-break"
              >
                <div className="report-yoga-head">
                  <span className="report-yoga-name">{yoga.display_name || yoga.name}</span>
                  <span
                    className="report-yoga-grade"
                    aria-label={t('yogas.grade_aria', {
                      grade: t(`yogas.grade.${yoga.grade}`),
                    })}
                  >
                    {t(`yogas.grade.${yoga.grade}`)}
                  </span>
                </div>
                {yoga.description ? (
                  <p className="report-yoga-desc">{yoga.description}</p>
                ) : null}
                {basis ? (
                  <p className="report-yoga-basis">
                    {basis.description}
                    {' — '}
                    <cite className="report-yoga-source">{basis.source}</cite>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
