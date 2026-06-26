/**
 * IdentityStrip — the dashboard's compact chart-identity band.
 *
 * Quiet and typographic: the person's name as the page heading, then the four
 * facts an astrologer reaches for first — Lagna, Moon sign + nakshatra, and
 * the full running daśā stack (mahā/antar/pratyantar) with the declared year
 * convention. One hairline rule below; no boxes-in-boxes.
 *
 * Near a sign boundary the strip grows a first-class "Birth-time sensitivity"
 * callout (a product differentiator, not a footnote): it names the alternative
 * rising sign a few minutes of recorded birth time would produce, states that
 * every house would shift with it, and links to birth-time rectification.
 *
 * Display only — every value is the engine's verbatim output; `cuspInfo`
 * measures distance to a sign boundary, it never recomputes astrology.
 */

import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DashaData, VimshottariDashaData } from '@almamesh/shared-types';

import { cuspInfo } from '../../../lib/lagnaCusp';
import { nextAntar, nextPratyantar, type DashaTreeRow } from '../../../lib/dashaPeriods';
import { formatPredictiveDate } from '../../../lib/predictive';
import { grahaName, signName } from '../../../lib/predictiveEventCopy';

export interface IdentityLagna {
  readonly sign?: string;
  readonly longitude?: number;
  readonly nakshatra?: string;
  readonly nakshatraPada?: number;
}

export interface IdentityMoon {
  readonly sign: string;
  readonly nakshatra?: string;
  readonly nakshatraPada?: number;
}

export interface IdentityStripProps {
  readonly name: string;
  readonly lagna: IdentityLagna | null;
  readonly moon: IdentityMoon | null;
  readonly dasha?: VimshottariDashaData;
  /** Right-aligned action cluster (mode toggle, quiet page actions). */
  readonly actions?: ReactNode;
}

/** "328.84" → "28°50′" (in-sign degrees, arc-minutes). */
function formatSignDegrees(longitude?: number): string | null {
  if (longitude === undefined || longitude === null) {
    return null;
  }
  const inSign = ((longitude % 30) + 30) % 30;
  const degrees = Math.floor(inSign);
  const minutes = Math.floor((inSign - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, '0')}′`;
}

/** Engine "Purva_Bhadrapada" → "Purva Bhadrapada" (proper noun, not translated). */
function prettyNakshatra(nakshatra?: string): string | null {
  if (!nakshatra) {
    return null;
  }
  const cleaned = nakshatra.replace(/_/g, ' ').trim();
  return cleaned.length === 0 ? null : cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-text-primary">{children}</dd>
    </div>
  );
}

function Unavailable(): ReactElement {
  const { t } = useTranslation('life');
  return <span className="text-text-tertiary">{t('identity.unavailable')}</span>;
}

function LagnaFact({ lagna }: { lagna: IdentityLagna | null }): ReactElement {
  const { t } = useTranslation(['life', 'predictive']);
  if (!lagna?.sign) {
    return (
      <Fact label={t('life:identity.lagna')}>
        <Unavailable />
      </Fact>
    );
  }
  const degrees = formatSignDegrees(lagna.longitude);
  const nakshatra = prettyNakshatra(lagna.nakshatra);
  return (
    <Fact label={t('life:identity.lagna')}>
      <span className="font-medium">{signName(t, lagna.sign.toLowerCase())}</span>
      {degrees && <span className="ml-1.5 font-mono text-xs text-text-secondary">{degrees}</span>}
      {nakshatra && (
        <span className="block text-xs text-text-secondary">
          {nakshatra}
          {lagna.nakshatraPada != null && (
            <span className="ml-1 text-text-tertiary">
              {t('life:identity.pada', { pada: lagna.nakshatraPada })}
            </span>
          )}
        </span>
      )}
    </Fact>
  );
}

/**
 * Near-cusp "Birth-time sensitivity" — a first-class callout, not a footnote.
 *
 * When the engine's Ascendant sits within a few degrees of a sign boundary
 * (`cuspInfo` measures display-only distance; it never recomputes astrology),
 * minutes of recorded birth time decide the whole chart: the rising sign would
 * flip to the neighbouring sign and every house would shift with it. So the
 * callout says exactly that — naming the alternative sign — and links straight
 * to birth-time rectification. Outside the threshold it renders nothing.
 * Quiet dashboard grammar: a hairline left rule and small caps, not an alarm box.
 */
function BirthTimeSensitivity({ lagna }: { lagna: IdentityLagna | null }): ReactElement | null {
  const { t } = useTranslation(['astrology', 'predictive']);
  if (!lagna?.sign || lagna.longitude === undefined || lagna.longitude === null) {
    return null;
  }
  const cusp = cuspInfo(lagna.sign, ((lagna.longitude % 30) + 30) % 30);
  if (!cusp) {
    return null;
  }
  const neighbour = signName(t, cusp.neighbourSign.toLowerCase());
  return (
    <div
      className="mt-5 max-w-2xl border-l-2 border-status-warning/50 pl-4"
      data-testid="birth-time-sensitivity"
      role="note"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-status-warning">
        {t('astrology:cusp.label')}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
        {t('astrology:cusp.proximity', {
          sign: signName(t, lagna.sign.toLowerCase()),
          degrees: cusp.degrees.toFixed(1),
          neighbour,
        })}{' '}
        {t('astrology:cusp.flip', { neighbour })}{' '}
        <Link
          to="/settings/profile"
          className="font-medium text-text-primary underline underline-offset-2 hover:text-accent-gold-bright"
        >
          {t('astrology:cusp.refine_link')}
        </Link>
      </p>
    </div>
  );
}

function MoonFact({ moon }: { moon: IdentityMoon | null }): ReactElement {
  const { t } = useTranslation(['life', 'predictive']);
  if (!moon) {
    return (
      <Fact label={t('life:identity.moon')}>
        <Unavailable />
      </Fact>
    );
  }
  const nakshatra = prettyNakshatra(moon.nakshatra);
  return (
    <Fact label={t('life:identity.moon')}>
      <span className="font-medium">{signName(t, moon.sign.toLowerCase())}</span>
      {nakshatra && (
        <span className="block text-xs text-text-secondary">
          {nakshatra}
          {moon.nakshatraPada != null && (
            <span className="ml-1 text-text-tertiary">
              {t('life:identity.pada', { pada: moon.nakshatraPada })}
            </span>
          )}
        </span>
      )}
    </Fact>
  );
}

/**
 * The structural slice the "now + next" line reads. `VimshottariDashaData` is
 * assignable today; the period-depth fields (`antar_sequence` rows inside
 * `full_sequence`, `pratyantar_sequence`) flow through once present and are
 * simply absent on older payloads — the line is then omitted entirely.
 */
interface PeriodDepthSource {
  readonly full_sequence: readonly DashaTreeRow[];
  readonly maha_dasha: DashaTreeRow;
  readonly antar_dasha?: DashaTreeRow | null;
  readonly pratyantar_dasha?: DashaTreeRow | null;
  readonly pratyantar_sequence?: readonly DashaTreeRow[] | null;
}

/**
 * "Next: Mercury Pratyantar from 06/13/2026 · Sun Antar from 01/31/2027" —
 * each "next" is the row AFTER the running one in an engine-emitted sequence
 * (pure list lookup, see `lib/dashaPeriods`), dated by the engine. Links to
 * the Periods explorer. Renders nothing when the payload carries no sequences.
 */
function NextPeriodsLine({ dasha }: { dasha: PeriodDepthSource }): ReactElement | null {
  const { t } = useTranslation(['life', 'astrology', 'predictive']);
  const nextPd = nextPratyantar(dasha.pratyantar_sequence, dasha.pratyantar_dasha ?? null);
  const nextAntarRow = nextAntar(dasha.full_sequence, dasha.maha_dasha, dasha.antar_dasha ?? null);
  if (!nextPd && !nextAntarRow) {
    return null;
  }
  const legs = [
    nextPd && { row: nextPd, level: 'pratyantar' as const },
    nextAntarRow && { row: nextAntarRow, level: 'antar' as const },
  ].filter((leg): leg is { row: DashaTreeRow; level: 'pratyantar' | 'antar' } => Boolean(leg));
  return (
    <span className="mt-0.5 block text-xs text-text-secondary" data-testid="identity-next-periods">
      <span className="text-text-tertiary">{t('life:identity.next_label')}</span>{' '}
      {legs
        .map((leg) =>
          t('life:identity.next_leg', {
            lord: grahaName(t, leg.row.lord),
            level: t(`astrology:dasha.${leg.level}`),
            date: formatPredictiveDate(leg.row.start_date),
          }),
        )
        .join(' · ')}
      {' · '}
      <Link
        to="/predictive?tab=periods"
        className="whitespace-nowrap text-accent-gold transition-colors hover:text-accent-gold-bright"
      >
        {t('life:identity.all_periods')}
      </Link>
    </span>
  );
}

function DashaFact({ dasha }: { dasha?: VimshottariDashaData }): ReactElement {
  const { t } = useTranslation(['life', 'astrology', 'predictive']);
  if (!dasha) {
    return (
      <Fact label={t('life:identity.dasha')}>
        <Unavailable />
      </Fact>
    );
  }
  const legs: DashaData[] = [dasha.maha_dasha, dasha.antar_dasha, dasha.pratyantar_dasha].filter(
    (leg): leg is DashaData => leg != null,
  );
  return (
    <Fact label={t('life:identity.dasha')}>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {legs.map((leg) => (
          <span key={leg.level} className="whitespace-nowrap">
            <span className="font-medium">{grahaName(t, leg.lord)}</span>{' '}
            <span className="text-xs text-text-tertiary">{t(`astrology:dasha.${leg.level}`)}</span>
          </span>
        ))}
      </span>
      <span className="block text-xs text-text-secondary">
        {t('life:identity.until', { date: formatPredictiveDate(dasha.maha_dasha.end_date) })}
        {dasha.convention && (
          <span className="text-text-tertiary">
            {' · '}
            {t(`predictive:convention.${dasha.convention}`)}
          </span>
        )}
      </span>
      <NextPeriodsLine dasha={dasha} />
    </Fact>
  );
}

/** The dashboard identity band: heading row + the typographic fact list. */
export function IdentityStrip({
  name,
  lagna,
  moon,
  dasha,
  actions,
}: IdentityStripProps): ReactElement {
  const { t } = useTranslation('life');
  return (
    <section className="border-b border-ui-border pb-6" data-testid="identity-strip">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
            {t('identity.kicker')}
          </p>
          <h1 className="mt-1 font-display text-3xl leading-tight text-text-primary">{name}</h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-3">
        <LagnaFact lagna={lagna} />
        <MoonFact moon={moon} />
        <DashaFact dasha={dasha} />
      </dl>

      <BirthTimeSensitivity lagna={lagna} />
    </section>
  );
}
