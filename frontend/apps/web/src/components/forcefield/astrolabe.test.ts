/**
 * The Living Astrolabe — pure presentation-decision logic (TDD).
 *
 * SYNTHETIC chart data only: these fixtures are hand-built PlanetWave rows,
 * not derived from any real birth data.
 */

import { describe, expect, it } from 'vitest';
import type {
  ActiveDasha,
  PlanetName,
  PlanetWave,
} from '@almamesh/shared-types';
import {
  ENTRANCE_DURATION,
  FIELD_OPACITY,
  LORD_OPACITY,
  LORD_PULSE,
  LORD_SCALE,
  MAX_THREADS,
  RING_RATE_MAX,
  RING_RATE_MIN,
  entrancePhase,
  labelVisible,
  planetReveal,
  planetRole,
  revealOrder,
  ringRateFromNetFlux,
  selectThreads,
} from './astrolabe';

/** Minimal synthetic wave row; only the fields the astrolabe logic reads. */
function wave(
  id: PlanetName,
  overrides: Partial<PlanetWave> = {},
): PlanetWave {
  return {
    id,
    orbitRadius: 5,
    orbitSpeed: 0.1,
    phase: 0,
    frequency: 1,
    amplitude: 0.5,
    coherence: 0.5,
    friendlinessToActive: 0.25,
    phaseShift: 0,
    waveColor: [0.5, 0.5, 0.5],
    eclipticLongitude: 0,
    ...overrides,
  };
}

const ACTIVE: ActiveDasha = { maha: 'saturn', antar: 'venus' };

describe('planetRole — focal hierarchy', () => {
  it('marks the mahadasha lord as the dominant element', () => {
    const role = planetRole('saturn', ACTIVE);
    expect(role.isMaha).toBe(true);
    expect(role.isLord).toBe(true);
    expect(role.scale).toBe(LORD_SCALE);
    expect(role.opacity).toBe(LORD_OPACITY);
    expect(role.pulseAmplitude).toBe(LORD_PULSE);
  });

  it('marks the antardasha lord as a lord too', () => {
    const role = planetRole('venus', ACTIVE);
    expect(role.isAntar).toBe(true);
    expect(role.isLord).toBe(true);
    expect(role.scale).toBe(LORD_SCALE);
  });

  it('recedes the other seven: reduced opacity, unit scale, zero pulse', () => {
    const role = planetRole('mars', ACTIVE);
    expect(role.isLord).toBe(false);
    expect(role.scale).toBe(1);
    expect(role.opacity).toBe(FIELD_OPACITY);
    expect(role.pulseAmplitude).toBe(0);
  });

  it('handles a null antardasha', () => {
    const role = planetRole('venus', { maha: 'saturn', antar: null });
    expect(role.isAntar).toBe(false);
    expect(role.isLord).toBe(false);
  });
});

describe('selectThreads — beams 27 → ≤3', () => {
  const planets: PlanetWave[] = [
    wave('saturn', { friendlinessToActive: 1 }),
    wave('venus', { friendlinessToActive: 1 }),
    wave('mars', { friendlinessToActive: -1, amplitude: 0.8 }),
    wave('sun', { friendlinessToActive: -1, amplitude: 0.3 }),
    wave('moon', { friendlinessToActive: 0.25 }),
    wave('jupiter', { friendlinessToActive: 0.25 }),
    wave('mercury', { friendlinessToActive: -1, amplitude: 0.6 }),
    wave('rahu', { friendlinessToActive: 0.25 }),
    wave('ketu', { friendlinessToActive: 0.25 }),
  ];

  it('threads the maha lord, the antar lord, and the strongest enemy', () => {
    const threads = selectThreads(planets, ACTIVE);
    expect(threads).toEqual([
      { planetId: 'saturn', kind: 'maha' },
      { planetId: 'venus', kind: 'antar' },
      { planetId: 'mars', kind: 'discord' },
    ]);
  });

  it('never exceeds MAX_THREADS', () => {
    expect(selectThreads(planets, ACTIVE).length).toBeLessThanOrEqual(
      MAX_THREADS,
    );
  });

  it('collapses to one thread when maha === antar', () => {
    const threads = selectThreads(planets, { maha: 'saturn', antar: 'saturn' });
    expect(threads.filter((t) => t.kind === 'maha')).toHaveLength(1);
    expect(threads.filter((t) => t.kind === 'antar')).toHaveLength(0);
  });

  it('omits the discord thread when no planet is hostile enough', () => {
    const friendly = planets.map((p) =>
      wave(p.id, { friendlinessToActive: 0.25 }),
    );
    const threads = selectThreads(friendly, ACTIVE);
    expect(threads.map((t) => t.kind)).toEqual(['maha', 'antar']);
  });

  it('never picks a dasha lord as the discord thread', () => {
    // Antar lord Mars is itself the strongest enemy of maha Saturn: the
    // discord thread must fall through to the next hostile planet.
    const active: ActiveDasha = { maha: 'saturn', antar: 'mars' };
    const threads = selectThreads(planets, active);
    const discord = threads.find((t) => t.kind === 'discord');
    expect(discord?.planetId).toBe('mercury');
  });

  it('skips lords missing from the frame without crashing', () => {
    const threads = selectThreads(
      planets.filter((p) => p.id !== 'saturn'),
      ACTIVE,
    );
    expect(threads.find((t) => t.kind === 'maha')).toBeUndefined();
    expect(threads.find((t) => t.kind === 'antar')).toBeDefined();
  });
});

describe('ringRateFromNetFlux — calm core pulse', () => {
  it('idles at the minimum rate when flux is balanced', () => {
    expect(ringRateFromNetFlux(0)).toBe(RING_RATE_MIN);
  });

  it('reaches the cap at the adapter clamp (|netFlux| = 2)', () => {
    expect(ringRateFromNetFlux(2)).toBe(RING_RATE_MAX);
    expect(ringRateFromNetFlux(-2)).toBe(RING_RATE_MAX);
  });

  it('never exceeds 0.5 rad/s, even past the clamp', () => {
    for (const nf of [-5, -2, -1, 0, 0.5, 1, 2, 5]) {
      expect(ringRateFromNetFlux(nf)).toBeLessThanOrEqual(0.5);
    }
  });

  it('is monotonic in |netFlux|', () => {
    expect(ringRateFromNetFlux(1)).toBeGreaterThan(ringRateFromNetFlux(0.2));
  });
});

describe('labelVisible — progressive disclosure', () => {
  it('is off by default', () => {
    expect(labelVisible(false, false)).toBe(false);
  });
  it('shows on hover', () => {
    expect(labelVisible(true, false)).toBe(true);
  });
  it('shows on selection', () => {
    expect(labelVisible(false, true)).toBe(true);
  });
});

describe('entrancePhase — ignition choreography', () => {
  it('starts dark', () => {
    const p = entrancePhase(0);
    expect(p.core).toBe(0);
    expect(p.ring).toBe(0);
    expect(p.threads).toBe(0);
  });

  it('completes by ENTRANCE_DURATION', () => {
    const p = entrancePhase(ENTRANCE_DURATION);
    expect(p.core).toBe(1);
    expect(p.ring).toBe(1);
    expect(p.threads).toBe(1);
  });

  it('sequences core → ring → threads', () => {
    const p = entrancePhase(0.8);
    expect(p.core).toBe(1);
    expect(p.ring).toBeGreaterThan(0);
    expect(p.ring).toBeLessThan(1);
    expect(p.threads).toBe(0);
  });

  it('skip=true (reduced motion) jumps to the final frame', () => {
    const p = entrancePhase(0, true);
    expect(p).toEqual({ core: 1, ring: 1, threads: 1 });
  });
});

describe('planetReveal — sequential fade-in by longitude order', () => {
  it('reveals earlier order indices first', () => {
    const t = 1.3;
    expect(planetReveal(t, 0, 9)).toBeGreaterThan(planetReveal(t, 8, 9));
  });

  it('all planets are fully revealed by ENTRANCE_DURATION', () => {
    for (let i = 0; i < 9; i++) {
      expect(planetReveal(ENTRANCE_DURATION, i, 9)).toBe(1);
    }
  });

  it('skip=true jumps to fully revealed', () => {
    expect(planetReveal(0, 8, 9, true)).toBe(1);
  });

  it('is clamped to [0, 1]', () => {
    expect(planetReveal(0, 0, 9)).toBe(0);
    expect(planetReveal(100, 0, 9)).toBe(1);
  });
});

describe('revealOrder — longitude ordering', () => {
  it('orders planets by ascending ecliptic longitude', () => {
    const planets = [
      wave('mars', { eclipticLongitude: 200 }),
      wave('sun', { eclipticLongitude: 10 }),
      wave('moon', { eclipticLongitude: 350 }),
    ];
    expect(revealOrder(planets)).toEqual(['sun', 'mars', 'moon']);
  });
});
