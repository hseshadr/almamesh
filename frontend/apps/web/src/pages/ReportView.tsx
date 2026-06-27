/**
 * ReportView — the dedicated, print-first Vedic report page (`/report`).
 *
 * Reads the SAME on-device sources the dashboard uses — the active profile's
 * chart from `useChartLibraryStore` and its (optional) interpretation from the
 * persisted interpretation store — and renders a single light "paper" document
 * styled for A4 ON SCREEN (WYSIWYG). The "Download PDF" action renders the
 * @react-pdf document — the SOLE PDF path (the legacy browser-print export is
 * gone). The audience is taken from the `?mode=` query param (falling back to
 * the stored content mode). No astrology is computed here; the page is pure
 * presentation over engine + LLM output.
 *
 * GRACEFUL DEGRADATION: only a missing CHART dead-ends (there is nothing to
 * report). When the interpretation has not been generated yet, the report still
 * renders its deterministic natal halves (cover · kundli · planets · dasha ·
 * yogas) and the PDF download stays enabled — only the written Interpretation
 * is omitted, with an on-screen hint to generate it for the full reading.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useChartLibraryStore, type StoredChart } from '@almamesh/store';
import type { LagnaData } from '@almamesh/browser/types';
import type { ProcessedBirthData } from '@almamesh/shared-types';
import { useStreamingInterpretation } from '../hooks/useStreamingInterpretation';
import { usePredictiveLayer, type PredictiveLayer } from '../hooks/usePredictiveLayer';
import { useElapsedSeconds, formatElapsed } from '../hooks/useElapsedSeconds';
import { useContentModeStore } from '../stores/contentMode';
import { resolveReportAudience } from '../lib/reportSelectors';
import { cuspInfo } from '../lib/lagnaCusp';
import { rectificationDelta } from '../lib/rectification';
import { downloadReportPdf, type ReportPdfChrome } from '../lib/downloadReportPdf';
import {
  ReportChartsPage,
  ReportCover,
  ReportDasha,
  ReportDomains,
  ReportFooter,
  ReportInterpretation,
  ReportPlanetTable,
  ReportStrength,
  ReportTransits,
  ReportVargas,
  ReportYogas,
} from '../components/features/report';
import '../styles/report-print.css';

/** A short ISO date (YYYY-MM-DD) for the PDF file/title. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Capitalize a sign name for the cusp lookup (matches the on-screen cover). */
function titleCaseSign(sign: string): string {
  return sign ? sign.charAt(0).toUpperCase() + sign.slice(1) : '';
}

/** Graceful fallback when there is no chart / no finished interpretation yet. */
function ReportEmpty({ message }: { message: string }): ReactElement {
  const { t } = useTranslation('report');
  return (
    <div className="report-screen">
      <div className="report-document">
        <div className="report-empty">
          <h1>{t('empty.heading')}</h1>
          <p className="report-prose">{message}</p>
          <Link to="/dashboard" className="report-toolbar-button report-toolbar-button-primary">
            {t('empty.back')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * On-screen (no-print) affordance to compute the predictive sections before
 * printing: honest copy, live elapsed time, explicit retry — and silent once
 * the contexts are ready (the sections themselves render instead).
 */
function ReportPredictivePending({ layer }: { layer: PredictiveLayer }): ReactElement | null {
  const { t } = useTranslation('report');
  const elapsed = useElapsedSeconds(layer.status === 'loading');

  if (layer.status === 'ready' || !layer.hasBirthData) {
    return null;
  }

  return (
    <div className="report-pending no-print" data-testid="report-predictive-pending">
      <h2>{t('predictive_pending.title')}</h2>
      {layer.status === 'loading' ? (
        <p>{t('predictive_pending.computing', { elapsed: formatElapsed(elapsed) })}</p>
      ) : layer.status === 'error' ? (
        <>
          <p>{t('predictive_pending.error')}</p>
          <button
            type="button"
            className="report-toolbar-button"
            onClick={layer.compute}
            disabled={!layer.canCompute}
            data-testid="report-predictive-retry"
          >
            {t('predictive_pending.retry')}
          </button>
        </>
      ) : (
        <>
          <p>{t('predictive_pending.body')}</p>
          {layer.canCompute ? (
            <button
              type="button"
              className="report-toolbar-button"
              onClick={layer.compute}
              data-testid="report-predictive-compute"
            >
              {t('predictive_pending.compute')}
            </button>
          ) : (
            <p>{t('predictive_pending.engine_warming')}</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Resolve the active profile's primary stored chart from the `charts` map.
 * Mirrors the store's own `getPrimaryChart` rule (the explicit primary, else the
 * first chart) but derives it purely from the subscribed `charts` value so the
 * component re-renders the moment IndexedDB rehydrates on a cold load — no
 * imperative `getState()` read needed.
 */
function selectPrimaryChart(charts: Readonly<Record<string, StoredChart>>): StoredChart | undefined {
  const all = Object.values(charts);
  return all.find((chart) => chart.is_primary) ?? all[0];
}

/** The print-first report page. */
export default function ReportView(): ReactElement {
  const navigate = useNavigate();
  const { t } = useTranslation('report');
  const [searchParams] = useSearchParams();
  const { contentMode } = useContentModeStore();

  // Subscribe to the chart map so the page re-renders once IndexedDB rehydrates.
  const charts = useChartLibraryStore((s) => s.charts);
  const storedChart = selectPrimaryChart(charts);
  const chartId = storedChart?.chart_id ?? null;
  const { interpretation, status } = useStreamingInterpretation(chartId);

  // The lazy predictive layer (transits / vargas / strength / domains): the
  // report renders these sections only when computed; otherwise it offers an
  // on-screen (never printed) affordance to compute before printing.
  const predictive = usePredictiveLayer();

  // `?mode=` wins; otherwise fall back to the dashboard's content mode.
  const fallbackMode = contentMode === 'technical' ? 'astrologer' : 'you';
  const audience = resolveReportAudience(searchParams.get('mode') ?? fallbackMode);

  const personName = storedChart?.person_name ?? '';

  // Only a missing CHART dead-ends — there is nothing to report. A missing
  // interpretation degrades gracefully (natal-only) below.
  const sidereal = storedChart?.sidereal_chart;
  if (!storedChart || !sidereal) {
    return <ReportEmpty message={t('empty.no_chart')} />;
  }

  // The written interpretation is OPTIONAL. It is only included when fully
  // generated; otherwise the report renders its deterministic natal halves and
  // shows an on-screen hint to generate the reading.
  const readyInterpretation =
    status === 'complete' && interpretation ? interpretation : undefined;

  const birth = storedChart.birth_data as ProcessedBirthData | undefined;
  const lagna = sidereal.lagna as LagnaData;

  // Build the @react-pdf "Download PDF" action. Reuses the SAME engine values and
  // formatters the on-screen report renders. Enabled whenever the chart is ready
  // (birth data present); the interpretation is OPTIONAL — when absent the PDF
  // degrades to its deterministic natal halves and omits the narrative section.
  const handleDownloadPdf = (): void => {
    if (!birth) {
      return;
    }
    const cusp = cuspInfo(titleCaseSign(lagna.sign), lagna.sign_degrees);
    const chrome: ReportPdfChrome = {
      personName,
      audienceLabel: t(`audience.${audience}`),
      subtitle: t('pdf.subtitle'),
      kicker: t('cover.kicker'),
      ascendantNote: cusp
        ? t('cover.cusp_note', { degrees: cusp.degrees.toFixed(1), sign: cusp.neighbourSign })
        : undefined,
      formatRectifiedNote: (delta) =>
        t('cover.rectified_note', {
          entered: delta.enteredLabel,
          rectified: delta.rectifiedLabel,
          sign: delta.deltaMinutes > 0 ? '+' : '−',
          minutes: Math.abs(delta.deltaMinutes),
        }),
      chartCaptions: {
        rasi: t('charts.rasi_caption'),
        navamsa: t('charts.navamsa_caption'),
      },
      detailLabels: {
        dateOfBirth: t('cover.date_of_birth'),
        timeOfBirth: t('cover.time_of_birth'),
        placeOfBirth: t('cover.place_of_birth'),
        ascendant: t('cover.ascendant'),
      },
      chromeLabels: {
        preparedFor: t('cover.prepared_for'),
        birthDetailsTitle: t('pdf.birth_details_title'),
        birthDetailsEyebrow: t('pdf.birth_details_eyebrow'),
        birthDetailsIntro: t('pdf.birth_details_intro'),
        technicalNote: t('pdf.technical_note'),
        footerNote: t('pdf.footer_note'),
        planetsEyebrow: t('pdf.planets_eyebrow'),
        planetsTitle: t('planets.heading'),
        planetsIntro: t('pdf.planets_intro'),
        colPlanet: t('planets.col_planet'),
        colSign: t('planets.col_sign'),
        colDegree: t('planets.col_degree'),
        colNakshatra: t('planets.col_nakshatra'),
        colHouse: t('pdf.house_short'),
        colDignity: t('planets.col_dignity'),
        lagnaRowName: t('pdf.lagna_row_name'),
        chartsEyebrow: t('pdf.charts_eyebrow'),
        chartsTitle: t('charts.heading'),
        chartsIntro: t('pdf.charts_intro'),
        dashaEyebrow: t('pdf.dasha_eyebrow'),
        dashaTitle: t('dasha.heading'),
        dashaIntro: t('pdf.dasha_intro'),
        dashaCurrentLabel: t('pdf.dasha_current_label'),
        dashaSequenceLabel: t('pdf.dasha_sequence_label'),
        dashaAntarLabel: t('pdf.dasha_antar_label'),
        yogasEyebrow: t('pdf.yogas_eyebrow'),
        yogasTitle: t('yogas.heading'),
        yogasIntro: t('pdf.yogas_intro'),
        narrativeEyebrow: t('pdf.narrative_eyebrow'),
        narrativeTitle: t('interpretation.heading'),
        narrativeIntro: t('pdf.narrative_intro'),
      },
    };
    void downloadReportPdf({
      birth,
      lagna,
      chart: { ayanamsa_value: sidereal.ayanamsa_value },
      sidereal,
      interpretation: readyInterpretation,
      audience,
      chrome,
      fileBaseName: t('pdf_title', { name: personName, date: isoDate(new Date()) }),
    });
  };

  return (
    <div className="report-screen">
      <div className="report-toolbar no-print" data-testid="report-toolbar">
        <button
          type="button"
          className="report-toolbar-button report-toolbar-button-primary no-print"
          onClick={handleDownloadPdf}
          data-testid="report-download-pdf"
        >
          {t('download_pdf')}
        </button>
        <button
          type="button"
          className="report-toolbar-button no-print"
          onClick={() => navigate(-1)}
          data-testid="report-back"
        >
          {t('common:actions.back')}
        </button>
      </div>

      {/* Natal-only hint: the report is fully usable without the written reading;
          this nudges the user to generate it for the complete report. */}
      {!readyInterpretation ? (
        <div className="report-pending no-print" data-testid="report-narrative-hint">
          <p>{t('narrative_hint')}</p>
        </div>
      ) : null}

      {/* Compute-before-printing affordance for the predictive sections. */}
      <ReportPredictivePending layer={predictive} />

      <article className="report-document" data-testid="report-document">
        {birth ? (
          <ReportCover
            personName={personName}
            audience={audience}
            birth={birth}
            lagna={lagna}
            rectification={rectificationDelta(birth)}
          />
        ) : null}
        <ReportChartsPage chart={sidereal} />
        <ReportPlanetTable chart={sidereal} />
        <ReportYogas
          yogas={sidereal.yogas}
          interpretation={readyInterpretation}
          audience={audience}
        />
        <ReportDasha dashas={sidereal.dashas} />
        {readyInterpretation ? (
          <ReportInterpretation interpretation={readyInterpretation} audience={audience} />
        ) : null}
        {/* Predictive sections — rendered only when the lazy contexts are
            computed (sections VI–IX live after the fixed I–V numbering). */}
        {predictive.status === 'ready' && predictive.transitCtx && (
          <ReportTransits transitCtx={predictive.transitCtx} />
        )}
        {predictive.status === 'ready' && predictive.vargaCtxFull && (
          <ReportVargas vargaCtxFull={predictive.vargaCtxFull} />
        )}
        {predictive.status === 'ready' && predictive.strengthCtx && (
          <ReportStrength strengthCtx={predictive.strengthCtx} />
        )}
        {predictive.status === 'ready' && predictive.domainsCtx && (
          <ReportDomains domainsCtx={predictive.domainsCtx} />
        )}
        <ReportFooter personName={personName} />
      </article>
    </div>
  );
}
