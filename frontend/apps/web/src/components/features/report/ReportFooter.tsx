/**
 * ReportFooter — small per-report attribution at the foot of the document.
 *
 * Names the ayanamsa (calculation provenance) and the person the report is for.
 * Page numbers are handled by the print stylesheet's `@page` counters, not here.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

interface ReportFooterProps {
  readonly personName: string;
}

/** Attribution footer: ayanamsa provenance + the subject's name. */
export function ReportFooter({ personName }: ReportFooterProps): ReactElement {
  const { t } = useTranslation('report');
  return (
    <footer className="report-footer" data-testid="report-footer">
      <span>{t('footer.provenance')}</span>
      <span className="report-footer-name">{personName}</span>
    </footer>
  );
}
