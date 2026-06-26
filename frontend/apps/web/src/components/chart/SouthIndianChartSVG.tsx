/**
 * South Indian Rāśi chart (SVG) — AlmaMesh.
 *
 * A degree-accurate, sign-FIXED 4x4 grid. Each of the 12 zodiac signs occupies
 * a fixed cell (Pisces top-left, running clockwise); the centre 2x2 is empty and
 * carries the chart label. Consumes the renderer-agnostic `ChartGeometry` from
 * `@almamesh/store` — it RESHAPES only, computing no astrology.
 *
 * Aesthetic: an engraved observatory instrument. Hairline borders, obsidian
 * fills, brass-gold for the lagna and the selected planet, monospace degrees.
 */

import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartGeometry, ChartPlanet, ChartSign } from '@almamesh/store';
import { cn } from '../ui/cn';
import { chartTheme, planetInk, type ChartTheme, type ChartVariant } from './chartTheme';

export interface SouthIndianChartProps {
  readonly geometry: ChartGeometry;
  readonly selectedPlanet?: string | null;
  readonly onSelectPlanet?: (name: string | null) => void;
  /** Square edge length in px; the SVG scales to its container via viewBox. */
  readonly size?: number;
  /** Color theme: `screen` (dark, default) or `paper` (light, for print). */
  readonly variant?: ChartVariant;
  /** Centre-label chart name; defaults to the D1 "Rāśi". Pass the varga name
   *  (e.g. "Navāṁśa") when rendering a divisional chart so the plate never
   *  mislabels itself as the rāśi. */
  readonly centerTitle?: string;
  /** Centre-label chart code; defaults to "D1". Pass e.g. "D9" for vargas. */
  readonly centerCode?: string;
}

/** Three-letter sign abbreviations keyed by 0..11 zodiacal index (Aries=0). */
const SIGN_ABBREV: readonly string[] = [
  'Ari',
  'Tau',
  'Gem',
  'Can',
  'Leo',
  'Vir',
  'Lib',
  'Sco',
  'Sag',
  'Cap',
  'Aqu',
  'Pis',
];

/**
 * Sign-FIXED South Indian layout. Each cell holds a 0..11 sign index, or `null`
 * for the empty centre 2x2. Pisces top-left, running clockwise:
 *   [Pis(11) | Ari(0)  | Tau(1)  | Gem(2) ]
 *   [Aqu(10) |  · · ·  |  · · ·  | Can(3) ]
 *   [Cap(9)  |  · · ·  |  · · ·  | Leo(4) ]
 *   [Sag(8)  | Sco(7)  | Lib(6)  | Vir(5) ]
 */
const GRID_LAYOUT: readonly (readonly (number | null)[])[] = [
  [11, 0, 1, 2],
  [10, null, null, 3],
  [9, null, null, 4],
  [8, 7, 6, 5],
];

/** Format a 0–30 in-sign degree as `12°34'` (whole degrees + arcminutes). */
function formatSignDegrees(signDegrees: number): string {
  const whole = Math.floor(signDegrees);
  const minutes = Math.floor((signDegrees - whole) * 60);
  return `${whole}°${String(minutes).padStart(2, '0')}'`;
}

/** Planets sorted by longitude — stable cell ordering independent of map order. */
function sortByLongitude(planets: readonly ChartPlanet[]): ChartPlanet[] {
  return [...planets].sort((a, b) => a.longitude - b.longitude);
}

interface PlanetRowProps {
  readonly planet: ChartPlanet;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly isSelected: boolean;
  readonly theme: ChartTheme;
  readonly variant: ChartVariant;
  /** False for sign-precision (varga) charts — suppresses ALL degree text. */
  readonly showDegrees: boolean;
  readonly onSelect?: (name: string | null) => void;
}

function PlanetRow({
  planet,
  x,
  y,
  width,
  isSelected,
  theme,
  variant,
  showDegrees,
  onSelect,
}: PlanetRowProps) {
  const dim = planet.isCombust ? 0.55 : 1;
  const color = planetInk(planet.color, variant);
  return (
    <g
      role={onSelect ? 'button' : undefined}
      // Sign-precision (varga) placements have no real degree: describe the
      // planet by its sign instead of announcing a fabricated "0°00'".
      aria-label={
        showDegrees
          ? `${planet.name} ${formatSignDegrees(planet.signDegrees)}`
          : `${planet.name} in ${planet.sign}`
      }
      aria-pressed={onSelect ? isSelected : undefined}
      className={cn(onSelect && 'cursor-pointer')}
      onClick={
        onSelect ? () => onSelect(isSelected ? null : planet.name) : undefined
      }
    >
      {/* Generous transparent hit target across the row. */}
      <rect x={x} y={y - 9} width={width} height={14} fill="transparent" />
      {isSelected && (
        <rect
          x={x - 2}
          y={y - 9}
          width={width}
          height={14}
          rx={3}
          fill="none"
          stroke={theme.selectedStroke}
          strokeWidth={1}
        />
      )}
      {/* On the PAPER report the cells are narrow, so the retrograde mark moves
          into the RIGHT-anchored degree group: the abbreviation alone sits at
          the left edge and "(R) 23°58'" at the right, leaving the full cell
          width between them so they never collide into "Ke(R)23°58'". On SCREEN
          (unchanged) "(R)" stays next to the abbreviation. Either way the order
          reads abbreviation · (R) · degree. When there is no degree group
          (sign-precision vargas) the mark stays beside the abbreviation. */}
      <text
        x={x}
        y={y}
        fontSize={11}
        fontWeight={600}
        fill={color}
        opacity={dim}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {planet.label}
        {planet.isRetrograde && (variant !== 'paper' || !showDegrees) && (
          // ASCII "(R)" not the U+211E ℞ glyph: the print font has no ℞ glyph.
          <tspan fill={theme.accent} dx={2}>
            (R)
          </tspan>
        )}
      </text>
      {/* Degree readout — ONLY where real engine degrees exist. A varga is a
          sign-placement chart: printing "0°00'" there is fake precision. */}
      {showDegrees && (
        <text
          x={x + width}
          y={y}
          fontSize={9.5}
          textAnchor="end"
          opacity={dim}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {planet.isRetrograde && variant === 'paper' && (
            <tspan fill={theme.accent}>(R) </tspan>
          )}
          <tspan fill={theme.mutedText}>{formatSignDegrees(planet.signDegrees)}</tspan>
        </text>
      )}
    </g>
  );
}

interface SignCellProps {
  readonly cell: ChartSign;
  readonly x: number;
  readonly y: number;
  readonly cellSize: number;
  readonly isLagna: boolean;
  readonly theme: ChartTheme;
  readonly variant: ChartVariant;
  /** False for sign-precision (varga) charts — suppresses ALL degree text. */
  readonly showDegrees: boolean;
  readonly selectedPlanet?: string | null;
  readonly onSelectPlanet?: (name: string | null) => void;
}

function SignCell({
  cell,
  x,
  y,
  cellSize,
  isLagna,
  theme,
  variant,
  showDegrees,
  selectedPlanet,
  onSelectPlanet,
}: SignCellProps) {
  const planets = sortByLongitude(cell.planets);
  const hasSelected = planets.some((p) => p.name === selectedPlanet);
  const pad = 7;

  return (
    <g data-testid={`sign-cell-${cell.signIndex}`}>
      <rect
        x={x}
        y={y}
        width={cellSize}
        height={cellSize}
        fill={isLagna ? theme.lagnaFill : theme.cellFill}
        stroke={hasSelected ? theme.selectedStroke : theme.gridStroke}
        strokeWidth={hasSelected ? 1.5 : 1}
      />

      {/* House number (top-right, faint engraved label). */}
      <text
        x={x + cellSize - pad}
        y={y + pad + 7}
        fontSize={9}
        fontWeight={600}
        textAnchor="end"
        fill={theme.mutedText}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {cell.house}
      </text>

      {/* Lagna marker (top-left, brass). */}
      {isLagna && (
        <text
          x={x + pad}
          y={y + pad + 7}
          fontSize={9}
          fontWeight={700}
          fill={theme.accent}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          La
        </text>
      )}

      {/* Sign abbreviation. */}
      <text
        x={isLagna ? x + pad + 18 : x + pad}
        y={y + pad + 7}
        fontSize={10}
        fontWeight={600}
        fill={theme.signText}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {SIGN_ABBREV[cell.signIndex]}
      </text>

      {/* Planets, one per row, sorted by longitude. */}
      {planets.map((planet, i) => (
        <PlanetRow
          key={planet.name}
          planet={planet}
          x={x + pad}
          y={y + pad + 24 + i * 14}
          width={cellSize - pad * 2}
          isSelected={planet.name === selectedPlanet}
          theme={theme}
          variant={variant}
          showDegrees={showDegrees}
          onSelect={onSelectPlanet}
        />
      ))}
    </g>
  );
}

export function SouthIndianChartSVG({
  geometry,
  selectedPlanet,
  onSelectPlanet,
  size = 360,
  variant = 'screen',
  centerTitle = 'Rāśi',
  centerCode = 'D1',
}: SouthIndianChartProps): ReactElement {
  const { t } = useTranslation('astrology');
  const cellSize = size / 4;
  const theme = chartTheme(variant);
  const lagnaSignIndex = geometry.lagna.signIndex;
  // Degree readouts render ONLY for degree-precision charts (the D1 rasi);
  // vargas are sign-placement charts and must never print fabricated degrees.
  const showDegrees = geometry.precision === 'degree';

  // Index the sign-fixed view by signIndex for O(1) cell lookup.
  const signByIndex = useMemo(() => {
    const map = new Map<number, ChartSign>();
    for (const sign of geometry.signs) {
      map.set(sign.signIndex, sign);
    }
    return map;
  }, [geometry.signs]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={t('chart.south_aria')}
      className="max-w-full"
    >
      <rect
        x={0}
        y={0}
        width={size}
        height={size}
        fill={theme.background}
        stroke={theme.gridStroke}
        strokeWidth={1}
      />

      {GRID_LAYOUT.map((row, rowIndex) =>
        row.map((signIndex, colIndex) => {
          const x = colIndex * cellSize;
          const y = rowIndex * cellSize;
          if (signIndex === null) {
            return (
              <rect
                key={`empty-${rowIndex}-${colIndex}`}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                fill={theme.background}
                stroke={theme.gridStroke}
                strokeWidth={1}
              />
            );
          }
          const cell = signByIndex.get(signIndex);
          if (!cell) return null;
          return (
            <SignCell
              key={`cell-${signIndex}`}
              cell={cell}
              x={x}
              y={y}
              cellSize={cellSize}
              isLagna={signIndex === lagnaSignIndex}
              theme={theme}
              variant={variant}
              showDegrees={showDegrees}
              selectedPlanet={selectedPlanet}
              onSelectPlanet={onSelectPlanet}
            />
          );
        }),
      )}

      {/* Centre label in the empty 2x2 — names the chart actually rendered
          (a D9 plate must never carry the D1 "Rāśi" label). */}
      <text
        x={size / 2}
        y={size / 2 - 7}
        fontSize={13}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={theme.ink}
        style={{ fontFamily: 'var(--font-display)' }}
        data-testid="south-chart-center-title"
      >
        {centerTitle}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 11}
        fontSize={9}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={theme.mutedText}
        style={{ fontFamily: 'var(--font-mono)' }}
        data-testid="south-chart-center-code"
      >
        {centerCode}
      </text>
    </svg>
  );
}
