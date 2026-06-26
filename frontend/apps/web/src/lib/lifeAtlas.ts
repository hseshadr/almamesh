/**
 * Life Atlas — pure helpers for the seven life-domain surfaces.
 *
 * The dashboard's Life Atlas grid and the `/life/:domain` detail pages share
 * this single source of truth for: the canonical domain order, route-slug
 * validation, "next timed window" selection, and the mapping from an engine
 * domain to its matching AI-interpretation section (where one exists — the
 * `family` domain is deliberately engine-only, the structured interpretation
 * has no family section and we never fake one).
 *
 * No astrology here: the engine emits `DomainsCtx` verbatim; these helpers
 * only select and route already-computed values.
 */

import type {
  DomainWindowData,
  LifeDomain,
  LifeDomainForecastData,
  Persona,
  VedicInterpretation,
} from '@almamesh/shared-types';

/** The seven canonical life domains, in stable render/route order. */
export const LIFE_DOMAINS: readonly LifeDomain[] = [
  'career',
  'finances',
  'health',
  'relationships',
  'spiritual',
  'education',
  'family',
];

const LIFE_DOMAIN_SET: ReadonlySet<string> = new Set(LIFE_DOMAINS);

/** Route-slug guard: `/life/:domain` only accepts the canonical slugs. */
export function isLifeDomain(value: string): value is LifeDomain {
  return LIFE_DOMAIN_SET.has(value);
}

/**
 * The earliest upcoming timed window for a domain, or null when the engine
 * emitted none. The engine already emits future windows; sorting defensively
 * keeps "next" honest even if emission order ever changes.
 */
export function nextWindow(forecast: LifeDomainForecastData): DomainWindowData | null {
  if (forecast.upcoming_windows.length === 0) {
    return null;
  }
  return [...forecast.upcoming_windows].sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** Interpretation sections that carry per-domain guidance. */
export type DomainGuidanceKey =
  | 'career_guidance'
  | 'finances_guidance'
  | 'health_guidance'
  | 'relationship_guidance'
  | 'spiritual_guidance'
  | 'education_guidance';

/**
 * Engine domain → structured-interpretation section. `family` maps to null:
 * the interpretation schema has no family section and the Life Atlas labels
 * that domain engine-only rather than borrowing an unrelated reading.
 */
export const DOMAIN_GUIDANCE_KEY: Record<LifeDomain, DomainGuidanceKey | null> = {
  career: 'career_guidance',
  finances: 'finances_guidance',
  health: 'health_guidance',
  relationships: 'relationship_guidance',
  spiritual: 'spiritual_guidance',
  education: 'education_guidance',
  family: null,
};

/**
 * The AI-narrated guidance for a domain, or null when the interpretation (or
 * the matching section, or any usable text in it) is absent.
 */
export function domainGuidance(
  interpretation: VedicInterpretation | null | undefined,
  domain: LifeDomain,
): Persona | null {
  const key = DOMAIN_GUIDANCE_KEY[domain];
  if (!interpretation || key === null) {
    return null;
  }
  const section = interpretation[key];
  if (!section) {
    return null;
  }
  const hasText =
    (section.layman?.trim().length ?? 0) > 0 || (section.technical?.trim().length ?? 0) > 0;
  return hasText ? section : null;
}
