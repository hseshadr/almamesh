import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildVargaGeometry, type ChartGeometry, type ChartPlanet, type ChartSign } from '@almamesh/store';
import { SouthIndianChartSVG } from '../SouthIndianChartSVG';

const ZODIAC = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;

function planet(overrides: Partial<ChartPlanet> & Pick<ChartPlanet, 'name'>): ChartPlanet {
  return {
    label: 'Su',
    longitude: 12.57,
    sign: 'Aries',
    signIndex: 0,
    signDegrees: 12.57,
    house: 1,
    nakshatra: 'Ashwini',
    pada: 2,
    dignity: 'exalted',
    isRetrograde: false,
    isCombust: false,
    housesRuled: [],
    isYogakaraka: false,
    color: '#E3B85A',
    ...overrides,
  };
}

function buildFixture(): ChartGeometry {
  const sun = planet({ name: 'sun', label: 'Su', signDegrees: 12.57, signIndex: 0, sign: 'Aries' });
  const mars = planet({
    name: 'mars',
    label: 'Ma',
    signIndex: 4,
    sign: 'Leo',
    house: 5,
    longitude: 124.0,
    signDegrees: 4.0,
    isRetrograde: true,
    color: '#D98080',
  });
  const planets: ChartPlanet[] = [sun, mars];
  const signs: ChartSign[] = ZODIAC.map((sign, signIndex) => ({
    sign,
    signIndex,
    house: ((signIndex - 0 + 12) % 12) + 1,
    planets: planets.filter((p) => p.signIndex === signIndex),
  }));
  return {
    precision: 'degree',
    lagna: { sign: 'Aries', signIndex: 0, longitude: 5, signDegrees: 5 },
    planets,
    houses: [],
    signs,
  };
}

describe('SouthIndianChartSVG', () => {
  it('renders all 12 sign cells and leaves the centre 2x2 empty', () => {
    const { container } = render(<SouthIndianChartSVG geometry={buildFixture()} />);
    for (let i = 0; i < 12; i += 1) {
      expect(container.querySelector(`[data-testid="sign-cell-${i}"]`)).toBeTruthy();
    }
    // 12 sign cells exist; nothing renders a 13th cell into the empty centre.
    const cells = container.querySelectorAll('[data-testid^="sign-cell-"]');
    expect(cells.length).toBe(12);
  });

  it('shows a planet label and its in-sign degree', () => {
    render(<SouthIndianChartSVG geometry={buildFixture()} />);
    expect(screen.getByText('Su')).toBeTruthy();
    expect(screen.getByText("12°34'")).toBeTruthy();
  });

  it('marks the lagna sign cell with a brass "La"', () => {
    render(<SouthIndianChartSVG geometry={buildFixture()} />);
    expect(screen.getByText('La')).toBeTruthy();
  });

  it('renders the retrograde mark for a retrograde planet', () => {
    render(<SouthIndianChartSVG geometry={buildFixture()} />);
    expect(screen.getByText('(R)')).toBeTruthy();
  });

  it('fires onSelectPlanet when a planet is clicked', () => {
    const onSelect = vi.fn();
    render(<SouthIndianChartSVG geometry={buildFixture()} onSelectPlanet={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /sun/i }));
    expect(onSelect).toHaveBeenCalledWith('sun');
  });

  it('toggles selection off when the selected planet is clicked again', () => {
    const onSelect = vi.fn();
    render(
      <SouthIndianChartSVG geometry={buildFixture()} selectedPlanet="sun" onSelectPlanet={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /sun/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('defaults to the dark screen theme (outer frame keeps the obsidian fill)', () => {
    const { container } = render(<SouthIndianChartSVG geometry={buildFixture()} />);
    const frame = container.querySelector('rect');
    expect(frame?.getAttribute('fill')).toBe('#0B0E17');
    expect(frame?.getAttribute('fill')).not.toBe('#FBF7EE');
  });

  it('applies the light paper theme when variant="paper"', () => {
    const { container } = render(
      <SouthIndianChartSVG geometry={buildFixture()} variant="paper" />,
    );
    // Outer frame → cream background, dark-slate grid stroke.
    const frame = container.querySelector('rect');
    expect(frame?.getAttribute('fill')).toBe('#FBF7EE');
    expect(frame?.getAttribute('stroke')).toBe('#4B5563');
    // A non-lagna sign cell uses the white paper fill; never the dark navy.
    const cell = container.querySelector('[data-testid="sign-cell-4"] rect');
    expect(cell?.getAttribute('fill')).toBe('#FFFFFF');
    // The lagna sign cell (Aries, index 0) carries the gold paper tint.
    const lagnaCell = container.querySelector('[data-testid="sign-cell-0"] rect');
    expect(lagnaCell?.getAttribute('fill')).toBe('#FEF3C7');
  });

  it('darkens a pale planet accent to dark ink on paper (legible on white)', () => {
    render(<SouthIndianChartSVG geometry={buildFixture()} variant="paper" />);
    // Brass-gold Sun (#E3B85A) is too pale on white → pulled toward ink.
    const sun = screen.getByText('Su');
    expect(sun.getAttribute('fill')).not.toBe('#E3B85A');
    expect(sun.getAttribute('fill')).not.toBe('#FFFFFF');
  });

  it('labels the centre with the D1 Rāśi defaults', () => {
    render(<SouthIndianChartSVG geometry={buildFixture()} />);
    expect(screen.getByTestId('south-chart-center-title').textContent).toBe('Rāśi');
    expect(screen.getByTestId('south-chart-center-code').textContent).toBe('D1');
  });
});

describe('SouthIndianChartSVG — sign-precision varga (D9)', () => {
  // A varga is a sign-placement chart: the engine emits NO in-varga longitudes,
  // so the grid must show bare glyphs — never the fabricated "0°00'" an expert
  // reads as a calculation bug.
  const vargaGeometry = buildVargaGeometry({
    name: 'D9',
    lagna_sign: 'Scorpio',
    lagna_sign_lord: 'mars',
    planets: {
      saturn: { name: 'saturn', sign: 'Aquarius', sign_lord: 'saturn' },
      jupiter: { name: 'jupiter', sign: 'Pisces', sign_lord: 'jupiter' },
    },
  });

  it('renders NO degree text anywhere on the varga plate', () => {
    const { container } = render(
      <SouthIndianChartSVG geometry={vargaGeometry} centerTitle="Navāṁśa" centerCode="D9" />,
    );
    expect(screen.getByText('Sa')).toBeTruthy();
    expect(screen.getByText('Ju')).toBeTruthy();
    expect(container.textContent).not.toContain('°');
  });

  it('describes varga planets by sign, not by a fabricated degree, for AT', () => {
    const { container } = render(
      <SouthIndianChartSVG geometry={vargaGeometry} centerTitle="Navāṁśa" centerCode="D9" />,
    );
    expect(container.querySelector('[aria-label="saturn in Aquarius"]')).toBeTruthy();
    expect(container.querySelector('[aria-label*="0°00"]')).toBeNull();
  });

  it('labels the plate centre with the varga, never the D1 Rāśi default', () => {
    render(
      <SouthIndianChartSVG geometry={vargaGeometry} centerTitle="Navāṁśa" centerCode="D9" />,
    );
    expect(screen.getByTestId('south-chart-center-title').textContent).toBe('Navāṁśa');
    expect(screen.getByTestId('south-chart-center-code').textContent).toBe('D9');
  });
});
