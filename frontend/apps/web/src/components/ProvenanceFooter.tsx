import { useTranslation } from 'react-i18next'
import { useChartEngine } from '../providers/AlmaMeshRuntimeProvider'
import { formatDisplayDate } from '../lib/dates'

/** Title-case an ayanamsa key like "lahiri" -> "Lahiri". */
function titleCase(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

/** Strip a `.bsp`/`.all` extension so "de421.bsp" reads as "de421". */
function ephemerisLabel(file: string): string {
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

/**
 * Per-report provenance line — trust through transparency.
 *
 * Surfaces the synced bundle's `almamesh_meta.json` so every chart states how it
 * was produced: on this device, by a known engine + ephemeris + ayanamsa. Reads
 * the meta from the runtime context (set once the engine is ready); renders
 * nothing until the bundle is synced, so it never blocks the chart UI.
 */
export function ProvenanceFooter() {
  const { t } = useTranslation()
  const { meta } = useChartEngine()
  if (meta === null) {
    return null
  }

  const today = formatDisplayDate(new Date(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <p
      className="mt-6 text-center text-xs text-text-secondary/70 select-text"
      aria-label={t('provenance.aria')}
    >
      Calculated locally by AlmaMesh · Engine {meta.engine_version} · Ayanamsa{' '}
      {titleCase(meta.ayanamsa)} · Ephemeris {ephemerisLabel(meta.ephemeris_file)}{' '}
      · {today}
    </p>
  )
}
