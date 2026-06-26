/**
 * Chart rendering theme — AlmaMesh kundli SVGs.
 *
 * Two variants share one renderer:
 *  - `screen`: the dark "observatory" aesthetic (obsidian fills, brass-gold lagna,
 *    ivory ink). This is the default and must stay byte-identical to the prior UI.
 *  - `paper`: a light/cream print theme for the dedicated PDF report — white/cream
 *    cells, dark-slate grid, dark-ink labels, a subtle gold lagna tint. Solid
 *    fills only (no opacity-dependent legibility) so `print-color-adjust: exact`
 *    reproduces it faithfully.
 *
 * The object is selected ONCE per render by `chartTheme(variant)` and threaded
 * down to every cell — no per-element branching on the variant string, no `any`.
 * Planet accent colors come from the engine (`ChartPlanet.color`, sourced from
 * `@almamesh/constants` PLANET_COLORS); on paper they are darkened toward ink so
 * they stay legible on white. This is a DISPLAY transform only — it never touches
 * chart math.
 */

export type ChartVariant = 'screen' | 'paper';

/** Resolved color tokens for one chart variant. All values are solid (no alpha). */
export interface ChartTheme {
  /** Outer frame + empty-cell background. */
  readonly background: string;
  /** Cell fill for a normal (non-lagna, unselected) cell. */
  readonly cellFill: string;
  /** Grid / border / structural-line stroke. */
  readonly gridStroke: string;
  /** Lagna (ascendant) cell fill. */
  readonly lagnaFill: string;
  /** Lagna / selected-cell stroke + the "La" marker + retrograde glyph. */
  readonly accent: string;
  /** Selected-cell stroke (highlight ring). */
  readonly selectedStroke: string;
  /** Primary readable ink: planet labels fall back to this, centre label. */
  readonly ink: string;
  /** Sign abbreviation / sign text. */
  readonly signText: string;
  /** Faint engraved labels: house numbers, sign numbers, secondary degree text. */
  readonly mutedText: string;
}

const SCREEN_THEME: ChartTheme = {
  background: '#0B0E17',
  cellFill: '#11151F',
  gridStroke: '#262B38',
  lagnaFill: '#1A1F2E',
  accent: '#C9A24B',
  selectedStroke: '#C9A24B',
  ink: '#F4F1E8',
  signText: '#C7C2B2',
  mutedText: '#8A8576',
};

const PAPER_THEME: ChartTheme = {
  background: '#FBF7EE',
  cellFill: '#FFFFFF',
  gridStroke: '#4B5563',
  lagnaFill: '#FEF3C7',
  accent: '#B8860B',
  selectedStroke: '#B8860B',
  ink: '#111827',
  signText: '#1F2937',
  mutedText: '#4B5563',
};

/** Select the resolved theme for a chart variant (`screen` is the default). */
export function chartTheme(variant: ChartVariant): ChartTheme {
  return variant === 'paper' ? PAPER_THEME : SCREEN_THEME;
}

/** Parse a `#RRGGBB` hex color into 0–255 channels. Falls back to mid-gray. */
function parseHex(hex: string): { readonly r: number; readonly g: number; readonly b: number } {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return { r: 128, g: 128, b: 128 };
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/** Serialize 0–255 channels back to `#RRGGBB`. */
function toHex(r: number, g: number, b: number): string {
  const part = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Relative luminance (0–255 scale) of an RGB color — perceptual weighting. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A planet accent color legible on the variant's background.
 *
 * On `screen` the engine color is used verbatim. On `paper` a too-light accent
 * (e.g. silver Moon `#D8D4C6`) is blended toward ink so it stays readable on
 * white; already-dark accents pass through unchanged. Display only — no math.
 */
export function planetInk(engineColor: string, variant: ChartVariant): string {
  if (variant !== 'paper') return engineColor;
  const { r, g, b } = parseHex(engineColor);
  const lum = luminance(r, g, b);
  // Channels above this luminance are too pale to read on white; pull toward ink.
  const threshold = 150;
  if (lum <= threshold) return engineColor;
  const mix = Math.min(0.7, (lum - threshold) / (255 - threshold) + 0.3);
  const ink = { r: 0x11, g: 0x18, b: 0x27 };
  return toHex(r + (ink.r - r) * mix, g + (ink.g - g) * mix, b + (ink.b - b) * mix);
}
