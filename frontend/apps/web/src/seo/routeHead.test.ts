import { describe, it, expect } from 'vitest';

import {
  PUBLIC_ROUTE_HEADS,
  PUBLIC_ROUTE_PATHS,
  PRIVATE_ROUTE_PREFIXES,
  SITE_ORIGIN,
  OG_IMAGE_URL,
  getRouteHead,
  headElementsFor,
} from './routeHead';

/** Flatten the plugin-shaped elements into an easy lookup for assertions. */
function metaByName(els: ReadonlyArray<{ type: string; props: Record<string, string> }>) {
  const out = new Map<string, Record<string, string>>();
  for (const el of els) {
    const key =
      el.type === 'link'
        ? `link:${el.props.rel}`
        : `${el.type}:${el.props.name ?? el.props.property ?? ''}`;
    out.set(key, el.props);
  }
  return out;
}

describe('routeHead — the single per-route SEO source', () => {
  it('covers exactly the five public routes', () => {
    expect([...PUBLIC_ROUTE_PATHS].sort()).toEqual(
      ['/', '/welcome', '/privacy', '/terms', '/data-deletion'].sort(),
    );
    expect(PUBLIC_ROUTE_HEADS).toHaveLength(5);
  });

  it('gives every route a unique title, description, and canonical', () => {
    const titles = PUBLIC_ROUTE_HEADS.map((h) => h.title);
    const descriptions = PUBLIC_ROUTE_HEADS.map((h) => h.description);
    const canonicals = PUBLIC_ROUTE_HEADS.map((h) => h.canonical);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  it('canonical is the absolute almamesh.com URL of the route (no trailing slash except /)', () => {
    for (const head of PUBLIC_ROUTE_HEADS) {
      const expected = head.path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${head.path}`;
      expect(head.canonical).toBe(expected);
      expect(head.canonical.startsWith('https://almamesh.com')).toBe(true);
    }
  });

  it('titles and descriptions are search-result sized', () => {
    for (const head of PUBLIC_ROUTE_HEADS) {
      expect(head.title.length).toBeGreaterThanOrEqual(15);
      expect(head.title.length).toBeLessThanOrEqual(70);
      expect(head.description.length).toBeGreaterThanOrEqual(50);
      expect(head.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('headElementsFor emits description + canonical + OG + twitter for a route', () => {
    const head = getRouteHead('/welcome');
    expect(head).toBeDefined();
    const els = metaByName(headElementsFor('/welcome'));

    expect(els.get('meta:description')?.content).toBe(head!.description);
    expect(els.get('link:canonical')?.href).toBe(head!.canonical);
    expect(els.get('meta:og:title')?.content).toBe(head!.title);
    expect(els.get('meta:og:description')?.content).toBe(head!.description);
    expect(els.get('meta:og:url')?.content).toBe(head!.canonical);
    expect(els.get('meta:og:image')?.content).toBe(OG_IMAGE_URL);
    expect(els.get('meta:og:type')?.content).toBe('website');
    expect(els.get('meta:og:site_name')?.content).toBe('AlmaMesh');
    expect(els.get('meta:twitter:card')?.content).toBe('summary_large_image');
    expect(els.get('meta:twitter:title')?.content).toBe(head!.title);
    expect(els.get('meta:twitter:image')?.content).toBe(OG_IMAGE_URL);
  });

  it('every public route produces the same SHAPE of head elements', () => {
    const shapes = PUBLIC_ROUTE_PATHS.map((p) =>
      headElementsFor(p)
        .map((el) => `${el.type}:${el.props.rel ?? el.props.name ?? el.props.property}`)
        .sort()
        .join('|'),
    );
    expect(new Set(shapes).size).toBe(1);
  });

  it('returns undefined for private routes', () => {
    expect(getRouteHead('/dashboard')).toBeUndefined();
    expect(getRouteHead('/settings/profile')).toBeUndefined();
  });

  it('the private prefixes cover the whole app surface (robots.txt parity)', () => {
    expect([...PRIVATE_ROUTE_PREFIXES].sort()).toEqual(
      [
        '/dashboard',
        '/onboarding',
        '/predictive',
        '/report',
        '/mesh',
        '/rectify',
        '/settings',
        '/life',
      ].sort(),
    );
  });
});
