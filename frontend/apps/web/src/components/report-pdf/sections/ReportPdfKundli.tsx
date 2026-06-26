/**
 * ReportPdfKundli — the North-Indian (diamond) kundli rendered as a true VECTOR
 * inside the @react-pdf document, driven by the renderer-agnostic `ChartGeometry`
 * the on-screen SVGs already consume (so D1 and D9 share one renderer with the
 * app — calculation integrity: zero astrology recomputed here).
 *
 * The geometry is the canonical unit-square North-Indian layout ported from
 * `components/chart/NorthIndianChartSVG.tsx`: a square with both diagonals AND the
 * side-midpoint diamond, carving 12 FIXED house cells (H1 = top-center diamond,
 * counter-clockwise). House positions are fixed; the SIGN in each rotates with the
 * lagna — exactly what `ChartGeometry.houses` (ordered house 1..12) provides.
 *
 * Colours come from the shared `PAPER_THEME` (chartTheme.ts) so the plate matches
 * the app's printed report. Degree text is suppressed for sign-precision (varga)
 * charts — a fabricated "0°" reads as a calculation bug to a practitioner.
 */

import type { ReactElement } from 'react';
import { Svg, Polygon, Line, Rect, Text } from '@react-pdf/renderer';
import type { ChartGeometry, ChartHouse, ChartPlanet } from '@almamesh/store';
import { FONT_MONO, palette } from '../theme';

/** The paper kundli palette, mirrored from chartTheme.ts PAPER_THEME. */
const PAPER = {
  cellFill: '#FFFFFF',
  gridStroke: '#4B5563',
  lagnaFill: '#FEF3C7',
  accent: palette.brass,
  signNum: '#9A917D',
  ink: palette.ink,
} as const;

/** A point in unit-square space (0,0 top-left → 1,1 bottom-right). */
interface UnitPoint {
  readonly x: number;
  readonly y: number;
}

interface HouseCell {
  readonly polygon: readonly UnitPoint[];
  readonly centroid: UnitPoint;
}

// Canonical North-Indian cell geometry — IDENTICAL to NorthIndianChartSVG.tsx.
const TL: UnitPoint = { x: 0, y: 0 };
const TR: UnitPoint = { x: 1, y: 0 };
const BR: UnitPoint = { x: 1, y: 1 };
const BL: UnitPoint = { x: 0, y: 1 };
const T: UnitPoint = { x: 0.5, y: 0 };
const R: UnitPoint = { x: 1, y: 0.5 };
const B: UnitPoint = { x: 0.5, y: 1 };
const L: UnitPoint = { x: 0, y: 0.5 };
const C: UnitPoint = { x: 0.5, y: 0.5 };
const QTL: UnitPoint = { x: 0.25, y: 0.25 };
const QTR: UnitPoint = { x: 0.75, y: 0.25 };
const QBR: UnitPoint = { x: 0.75, y: 0.75 };
const QBL: UnitPoint = { x: 0.25, y: 0.75 };

function centroidOf(polygon: readonly UnitPoint[]): UnitPoint {
  const sum = polygon.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
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

const INTERNAL_LINES: readonly (readonly [UnitPoint, UnitPoint])[] = [
  [TL, BR],
  [TR, BL],
  [T, R],
  [R, B],
  [B, L],
  [L, T],
];

function scale(point: UnitPoint, size: number): UnitPoint {
  return { x: point.x * size, y: point.y * size };
}

function polygonPoints(polygon: readonly UnitPoint[], size: number): string {
  return polygon
    .map((p) => {
      const s = scale(p, size);
      return `${s.x},${s.y}`;
    })
    .join(' ');
}

/** A paper-legible planet ink (already resolved by the data builder). */
function planetLabel(planet: ChartPlanet, showDegrees: boolean): string {
  const retro = planet.isRetrograde ? ' (R)' : '';
  const degrees = showDegrees ? ` ${Math.floor(planet.signDegrees)}°` : '';
  return `${planet.label}${retro}${degrees}`;
}

interface HouseCellViewProps {
  readonly house: ChartHouse;
  readonly cell: HouseCell;
  readonly size: number;
  readonly isLagna: boolean;
  readonly showDegrees: boolean;
}

/** One house cell: filled polygon, faint sign number, lagna mark, planet rows. */
function HouseCellView({
  house,
  cell: houseCell,
  size,
  isLagna,
  showDegrees,
}: HouseCellViewProps): ReactElement {
  const center = scale(houseCell.centroid, size);
  const lineH = Math.max(9, size * 0.05);
  const planetFont = Math.max(7, size * 0.042);
  const signFont = Math.max(6, size * 0.034);
  const count = house.planets.length;
  const firstY = center.y - ((count - 1) * lineH) / 2 + lineH * 0.1;
  // The faint sign number sits above the planet stack.
  const signY = center.y - lineH * (count / 2 + 0.85);

  return (
    <>
      <Polygon
        points={polygonPoints(houseCell.polygon, size)}
        fill={isLagna ? PAPER.lagnaFill : PAPER.cellFill}
        stroke={isLagna ? PAPER.accent : PAPER.gridStroke}
        strokeWidth={isLagna ? 1.2 : 0.8}
      />
      <Text
        x={center.x}
        y={signY}
        style={{ fontFamily: FONT_MONO, fontSize: signFont, fill: PAPER.signNum }}
        textAnchor="middle"
      >
        {String(house.signIndex + 1)}
      </Text>
      {isLagna ? (
        <Text
          x={center.x}
          y={signY - signFont * 1.25}
          style={{ fontFamily: FONT_MONO, fontSize: signFont, fill: PAPER.accent }}
          textAnchor="middle"
        >
          La
        </Text>
      ) : null}
      {house.planets.map((planet, index) => (
        <Text
          key={planet.name}
          x={center.x}
          y={firstY + index * lineH}
          style={{ fontFamily: FONT_MONO, fontSize: planetFont, fill: planet.color }}
          textAnchor="middle"
        >
          {planetLabel(planet, showDegrees)}
        </Text>
      ))}
    </>
  );
}

interface ReportPdfKundliProps {
  readonly geometry: ChartGeometry;
  /** Side length in points. */
  readonly size: number;
}

/** A North-Indian kundli drawn as a self-contained @react-pdf vector. */
export function ReportPdfKundli({ geometry, size }: ReportPdfKundliProps): ReactElement {
  // The lagna lives in house 1 by whole-sign definition; match defensively.
  const lagnaHouse =
    geometry.houses.find((h) => h.signIndex === geometry.lagna.signIndex)?.house ?? 1;
  const showDegrees = geometry.precision === 'degree';

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect
        x={0}
        y={0}
        width={size}
        height={size}
        fill={PAPER.cellFill}
        stroke={PAPER.gridStroke}
        strokeWidth={1.4}
      />
      {geometry.houses.map((house, index) => (
        <HouseCellView
          key={house.house}
          house={house}
          cell={HOUSE_CELLS[index]}
          size={size}
          isLagna={house.house === lagnaHouse}
          showDegrees={showDegrees}
        />
      ))}
      {INTERNAL_LINES.map(([from, to], index) => {
        const a = scale(from, size);
        const b = scale(to, size);
        return (
          <Line
            key={index}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={PAPER.gridStroke}
            strokeWidth={0.8}
          />
        );
      })}
    </Svg>
  );
}
