/**
 * ReportVargas — the printed Shodasavarga section: framed paper plates for the
 * key vargas (D9 + D10 when emitted), the vargottama flags and the
 * Viṁśopaka/Ṣaḍvarga strength tallies, with `approximated` flags shown
 * honestly (≈ + footnote). Engine VargaCtxFull verbatim.
 */

import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { DivisionalChartId, VargaCtxFull } from '@almamesh/shared-types';
import { buildVargaGeometry, useChartStore, type ChartGeometry } from '@almamesh/store';
import { NorthIndianChartSVG } from '../../chart/NorthIndianChartSVG';
import { SouthIndianChartSVG } from '../../chart/SouthIndianChartSVG';
import { toVargaChart } from '../../../lib/predictive';
import { grahaName, signName } from '../../../lib/predictiveEventCopy';
import { ReportSectionHeading } from './ReportSectionHeading';

/** The vargas given a full chart plate in print (when the engine emitted them). */
const PLATE_VARGAS: readonly DivisionalChartId[] = ['D9', 'D10'];

interface ReportVargasProps {
  readonly vargaCtxFull: VargaCtxFull;
}

/** Divisional charts (key plates + strength tallies), paper-themed. */
export function ReportVargas({ vargaCtxFull }: ReportVargasProps): ReactElement {
  const { t } = useTranslation('report');
  const { t: tp } = useTranslation('predictive');
  const displayStyle = useChartStore((state) => state.displayStyle);
  const isNorth = displayStyle === 'north';

  const plates = useMemo(() => {
    const out: Array<{ id: DivisionalChartId; geometry: ChartGeometry }> = [];
    for (const id of PLATE_VARGAS) {
      const chart = vargaCtxFull.charts[id];
      if (chart) {
        out.push({ id, geometry: buildVargaGeometry(toVargaChart(chart)) });
      }
    }
    return out;
  }, [vargaCtxFull]);

  const ownSignByGraha = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of vargaCtxFull.shadvarga_own_sign) {
      map.set(row.graha, row.own_sign_count);
    }
    return map;
  }, [vargaCtxFull]);

  const anyApprox = vargaCtxFull.vimshopaka.some((row) => row.approximated);

  return (
    <section className="report-section" data-testid="report-vargas">
      <ReportSectionHeading index="VII" title={t('vargas_full.heading')} />
      <p className="report-note">{t('vargas_full.key_charts_note')}</p>

      {plates.length > 0 && (
        <div className="report-charts-grid">
          {plates.map(({ id, geometry }) => (
            <figure className="report-chart-figure report-avoid-break" key={id}>
              <figcaption className="report-chart-caption">
                {id} · {tp(`vargas.names.${id}`)}
              </figcaption>
              <div className="report-chart-frame">
                {isNorth ? (
                  <NorthIndianChartSVG geometry={geometry} size={300} variant="paper" />
                ) : (
                  <SouthIndianChartSVG
                    geometry={geometry}
                    size={300}
                    variant="paper"
                    centerTitle={tp(`vargas.names.${id}`)}
                    centerCode={id}
                  />
                )}
              </div>
            </figure>
          ))}
        </div>
      )}

      <h3 className="report-subsection-title">{t('vargas_full.vargottama_heading')}</h3>
      {vargaCtxFull.vargottama.length === 0 ? (
        <p className="report-note">{tp('vargas.vargottama_empty')}</p>
      ) : (
        <p className="report-prose" data-testid="report-vargottama">
          {vargaCtxFull.vargottama
            .map((flag) =>
              tp('vargas.vargottama_point', {
                point: flag.point === 'lagna' ? tp('vargas.lagna') : grahaName(tp, flag.point),
                sign: signName(tp, flag.sign),
              }),
            )
            .join(' · ')}
        </p>
      )}

      <h3 className="report-subsection-title">{t('vargas_full.vimshopaka_heading')}</h3>
      <table className="report-table" data-testid="report-vimshopaka">
        <thead>
          <tr>
            <th scope="col">{t('vargas_full.col_graha')}</th>
            <th scope="col">{t('vargas_full.col_score')}</th>
            <th scope="col">{t('vargas_full.col_own_charts')}</th>
          </tr>
        </thead>
        <tbody>
          {vargaCtxFull.vimshopaka.map((row) => (
            <tr key={row.graha} className="report-avoid-break">
              <td>{grahaName(tp, row.graha)}</td>
              <td>
                {row.score}
                {row.approximated ? ' ≈' : ''}
              </td>
              <td>
                {ownSignByGraha.has(row.graha)
                  ? tp('vargas.own_signs', { count: ownSignByGraha.get(row.graha) })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {anyApprox && <p className="report-note">{tp('vargas.approx_note')}</p>}
    </section>
  );
}
