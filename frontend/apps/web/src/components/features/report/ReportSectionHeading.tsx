/**
 * ReportSectionHeading — the numbered, serif section opener used across the
 * printed report (an eyebrow numeral, a serif display title, and a brass
 * double-rule ornament beneath). This is the typographic device that makes each
 * section read as a chapter of a bound almanac rather than a flat web heading.
 *
 * Presentational only — no astrology, no data. The roman numeral is passed in so
 * the page (which owns section order) controls the sequence.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

interface ReportSectionHeadingProps {
  /** Roman numeral / index shown in the eyebrow (e.g. "I", "II", "III"). */
  readonly index: string;
  /** The serif display title for the section. */
  readonly title: string;
}

/** A numbered serif section opener closed by a brass double rule. */
export function ReportSectionHeading({ index, title }: ReportSectionHeadingProps): ReactElement {
  const { t } = useTranslation('report');
  return (
    <div className="report-section-opener">
      <span className="report-section-eyebrow">{t('section_eyebrow', { index })}</span>
      <h2 className="report-section-title">{title}</h2>
      <hr className="report-rule-double" />
    </div>
  );
}
