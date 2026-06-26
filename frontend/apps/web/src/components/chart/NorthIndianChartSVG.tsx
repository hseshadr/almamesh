/**
 * North Indian Chart Component (SVG) — AlmaMesh Web
 *
 * Classic North Indian (diamond) kundli: a square with both diagonals AND the
 * diamond joining the four side-midpoints, carving 12 fixed house cells. Houses
 * are FIXED in position (H1 = top-center diamond, running counter-clockwise);
 * the SIGN of each house rotates by the lagna — exactly the house-fixed model
 * `ChartGeometry.houses` already provides (length-12, ordered house 1..12).
 *
 * This component is a pure renderer: it computes no astrology. All longitudes,
 * houses, signs, dignities come from the Python engine via `buildChartGeometry`.
 */

import { useMemo, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartGeometry, ChartHouse, ChartPlanet } from '@almamesh/store';
import { cn } from '../ui/cn';
import { chartTheme, planetInk, type ChartTheme, type ChartVariant } from './chartTheme';

export interface NorthIndianChartProps {
  readonly geometry: ChartGeometry;
  /** Lowercase planet key currently highlighted (cross-component selection). */
  readonly selectedPlanet?: string | null;
  /** Fired on planet click; passes the planet key, or `null` to clear. */
  readonly onSelectPlanet?: (name: string | null) => void;
  /** Rendered px size; the SVG itself is responsive via its viewBox. */
  readonly size?: number;
  /** Color theme: `screen` (dark, default) or `paper` (light, for print). */
  readonly variant?: ChartVariant;
}

/** A point in unit-square space (0,0 top-left → 1,1 bottom-right). */
interface UnitPoint {
  readonly x: number;
  readonly y: number;
}

/** A house cell: its polygon outline and a centroid to anchor labels at. */
interface HouseCell {
  readonly polygon: readonly UnitPoint[];
  readonly centroid: UnitPoint;
}

// --- Canonical North Indian cell geometry (house 1..12) ---------------------
//
// Square corners, edge-midpoints, centre, and the four points where the inner
// diamond's edges cross the diagonals (the "quarter" points). Counter-clockwise
// from the top-centre diamond. These are FIXED — only the sign in each rotates.
const TL: UnitPoint = { x: 0, y: 0 };
const TR: UnitPoint = { x: 1, y: 0 };
const BR: UnitPoint = { x: 1, y: 1 };
const BL: UnitPoint = { x: 0, y: 1 };
const T: UnitPoint = { x: 0.5, y: 0 };
const R: UnitPoint = { x: 1, y: 0.5 };
const B: UnitPoint = { x: 0.5, y: 1 };
const L: UnitPoint = { x: 0, y: 0.5 };
const C: UnitPoint = { x: 0.5, y: 0.5 };
const QTL: UnitPoint = { x: 0.25, y: 0.25 }; // diamond∩diagonal, top-left
const QTR: UnitPoint = { x: 0.75, y: 0.25 }; // top-right
const QBR: UnitPoint = { x: 0.75, y: 0.75 }; // bottom-right
const QBL: UnitPoint = { x: 0.25, y: 0.75 }; // bottom-left

/** Average of a polygon's vertices — good enough as a label anchor here. */
function centroidOf(polygon: readonly UnitPoint[]): UnitPoint {
  const sum = polygon.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}

function cell(polygon: readonly UnitPoint[]): HouseCell {
  return { polygon, centroid: centroidOf(polygon) };
}

/** Index 0..11 → the cell for house (index + 1), counter-clockwise from H1. */
const HOUSE_CELLS: readonly HouseCell[] = [
  cell([T, QTL, C, QTR]), // H1  top-center diamond
  cell([TL, T, QTL]), // H2  top-left triangle
  cell([TL, QTL, L]), // H3  left-top triangle
  cell([L, QTL, C, QBL]), // H4  left-center diamond
  cell([L, QBL, BL]), // H5  left-bottom triangle
  cell([BL, QBL, B]), // H6  bottom-left triangle
  cell([B, QBL, C, QBR]), // H7  bottom-center diamond
  cell([B, QBR, BR]), // H8  bottom-right triangle
  cell([BR, QBR, R]), // H9  right-bottom triangle
  cell([R, QBR, C, QTR]), // H10 right-center diamond
  cell([R, QTR, TR]), // H11 right-top triangle
  cell([TR, QTR, T]), // H12 top-right triangle
];

/** Format a planet's within-sign degrees as a whole-degree readout, e.g. `12°`. */
function formatDegrees(signDegrees: number): string {
  return `${Math.floor(signDegrees)}°`;
}

/** Scale a unit point into SVG pixel space. */
function scale(point: UnitPoint, size: number): UnitPoint {
  return { x: point.x * size, y: point.y * size };
}

/** Serialize a unit polygon into an SVG `points` string at the given size. */
function polygonPoints(polygon: readonly UnitPoint[], size: number): string {
  return polygon
    .map((p) => {
      const s = scale(p, size);
      return `${s.x},${s.y}`;
    })
    .join(' ');
}

interface HouseCellViewProps {
  readonly house: ChartHouse;
  readonly cell: HouseCell;
  readonly size: number;
  readonly isLagna: boolean;
  readonly theme: ChartTheme;
  readonly variant: ChartVariant;
  /** False for sign-precision (varga) charts — suppresses ALL degree text. */
  readonly showDegrees: boolean;
  readonly selectedPlanet?: string | null;
  readonly onSelectPlanet?: (name: string | null) => void;
}

/** One house cell: engraved polygon, faint sign number, lagna mark, planets. */
function HouseCellView({
  house,
  cell: houseCell,
  size,
  isLagna,
  theme,
  variant,
  showDegrees,
  selectedPlanet,
  onSelectPlanet,
}: HouseCellViewProps) {
  const center = scale(houseCell.centroid, size);
  const hasSelected = house.planets.some((p) => p.name === selectedPlanet);
  const planetLineHeight = Math.max(13, size * 0.038);
  // Stack the planet rows vertically, centred on the cell centroid.
  const firstY =
    center.y - ((house.planets.length - 1) * planetLineHeight) / 2 + planetLineHeight * 0.1;
  const highlighted = isLagna || hasSelected;

  return (
    <g>
      <polygon
        points={polygonPoints(houseCell.polygon, size)}
        className="transition-colors duration-200 ease-orbital"
        fill={highlighted ? theme.lagnaFill : theme.cellFill}
        stroke={highlighted ? theme.accent : theme.gridStroke}
        strokeWidth={1}
      />

      {/* Faint sign number (signIndex + 1) tucked above the centroid. */}
      <text
        x={center.x}
        y={center.y - planetLineHeight * (house.planets.length / 2 + 0.9)}
        textAnchor="middle"
        className="font-mono"
        fill={theme.mutedText}
        fontSize={Math.max(9, size * 0.026)}
      >
        {house.signIndex + 1}
      </text>

      {/* Lagna marker in the house holding the lagna (house 1 in whole-sign). */}
      {isLagna && (
        <text
          x={center.x}
          y={center.y - planetLineHeight * (house.planets.length / 2 + 1.9)}
          textAnchor="middle"
          className="font-mono font-semibold"
          fill={theme.accent}
          fontSize={Math.max(9, size * 0.028)}
        >
          La
        </text>
      )}

      {house.planets.map((planet, index) => (
        <PlanetGlyph
          key={planet.name}
          planet={planet}
          x={center.x}
          y={firstY + index * planetLineHeight}
          size={size}
          variant={variant}
          showDegrees={showDegrees}
          isSelected={planet.name === selectedPlanet}
          onSelectPlanet={onSelectPlanet}
        />
      ))}
    </g>
  );
}

interface PlanetGlyphProps {
  readonly planet: ChartPlanet;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly variant: ChartVariant;
  /** False for sign-precision (varga) charts — the glyph renders bare. */
  readonly showDegrees: boolean;
  readonly isSelected: boolean;
  readonly onSelectPlanet?: (name: string | null) => void;
}

/** A single planet readout: `Su 12°` (+ `(R)` retrograde), clickable + selectable. */
function PlanetGlyph({
  planet,
  x,
  y,
  size,
  variant,
  showDegrees,
  isSelected,
  onSelectPlanet,
}: PlanetGlyphProps) {
  const fontSize = Math.max(11, size * 0.034);
  const color = planetInk(planet.color, variant);
  // ASCII "(R)" for retrograde, not the U+211E ℞ glyph: the print font
  // (Spline Sans Mono) has no ℞ glyph, so it printed as a tofu box in the PDF.
  // Spaces separate the abbreviation, the retrograde mark, and the degree so
  // they never collide into "Ke(R)23°" — order: label · (R) · degree.
  // Sign-precision (varga) charts carry NO real degrees: render the bare glyph
  // — a fabricated "0°" reads as a calculation bug.
  const retro = planet.isRetrograde ? ' (R)' : '';
  const degrees = showDegrees ? ` ${formatDegrees(planet.signDegrees)}` : '';
  const label = `${planet.label}${retro}${degrees}`;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      role="button"
      aria-label={`${planet.name} in ${planet.sign}, house ${planet.house}`}
      aria-pressed={isSelected}
      tabIndex={onSelectPlanet ? 0 : undefined}
      onClick={() => onSelectPlanet?.(isSelected ? null : planet.name)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectPlanet?.(isSelected ? null : planet.name);
        }
      }}
      fill={color}
      fontSize={fontSize}
      className={cn(
        'font-mono transition-all duration-200 ease-orbital',
        onSelectPlanet && 'cursor-pointer',
        planet.isCombust && !isSelected && 'opacity-50',
        isSelected && 'font-semibold',
      )}
      style={
        isSelected ? { filter: `drop-shadow(0 0 6px ${color})`, fontWeight: 600 } : undefined
      }
      data-planet={planet.name}
    >
      {label}
    </text>
  );
}

/** North Indian (house-fixed diamond) kundli renderer. */
export function NorthIndianChartSVG({
  geometry,
  selectedPlanet = null,
  onSelectPlanet,
  size = 360,
  variant = 'screen',
}: NorthIndianChartProps): JSX.Element {
  const { t } = useTranslation('astrology');
  const theme = chartTheme(variant);
  // The lagna lives in house 1 by whole-sign definition; match defensively.
  const lagnaHouse = useMemo(() => {
    const byCusp = geometry.houses.find((h) => h.signIndex === geometry.lagna.signIndex);
    return byCusp?.house ?? 1;
  }, [geometry.houses, geometry.lagna.signIndex]);

  // The four internal lines: two diagonals + the side-midpoint diamond.
  const internalLines: readonly (readonly [UnitPoint, UnitPoint])[] = [
    [TL, BR],
    [TR, BL],
    [T, R],
    [R, B],
    [B, L],
    [L, T],
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={t('chart.north_aria')}
      className="select-none"
      data-testid="north-indian-chart"
    >
      {/* Outer square. */}
      <rect
        x={0}
        y={0}
        width={size}
        height={size}
        fill={theme.cellFill}
        stroke={theme.gridStroke}
        strokeWidth={1.5}
      />

      {/* House cells (drawn first so the structural lines sit crisply on top). */}
      {geometry.houses.map((house, index) => (
        <HouseCellView
          key={house.house}
          house={house}
          cell={HOUSE_CELLS[index]}
          size={size}
          isLagna={house.house === lagnaHouse}
          theme={theme}
          variant={variant}
          showDegrees={geometry.precision === 'degree'}
          selectedPlanet={selectedPlanet}
          onSelectPlanet={onSelectPlanet}
        />
      ))}

      {/* Engraved structural lines on top of the fills. */}
      {internalLines.map(([from, to], index) => {
        const a = scale(from, size);
        const b = scale(to, size);
        return (
          <line
            key={index}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={theme.gridStroke}
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
