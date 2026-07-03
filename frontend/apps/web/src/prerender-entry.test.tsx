// @vitest-environment node
//
// This test runs the REAL build-time prerender function under Vitest's plain
// Node environment — no happy-dom, no window, no mocks. That is deliberate:
// it is the unit-level canary for Spec 064's core constraint (the public-route
// component graph must be renderable in Node, where `vite build` executes it).
// If someone later adds an unguarded `window`/`localStorage`/`navigator`
// access to the landing or legal pages, THIS fails before the build does.
import { describe, it, expect } from 'vitest';

import { prerender } from './prerender-entry';
import { PUBLIC_ROUTE_PATHS, getRouteHead } from './seo/routeHead';
import enLanding from './locales/en/landing.json';
import enLegal from './locales/en/legal.json';

describe('prerender-entry (Node renderToString of the public shells)', () => {
  it('renders the landing at / with the real hero headline', async () => {
    const result = await prerender({ url: '/' });
    expect(result.html).toContain(enLanding.hero.headline);
    expect(result.head.title).toBe(getRouteHead('/')!.title);
  });

  it('renders the same landing shell at /welcome with its own head', async () => {
    const result = await prerender({ url: '/welcome' });
    expect(result.html).toContain(enLanding.hero.headline);
    expect(result.head.title).toBe(getRouteHead('/welcome')!.title);
  });

  it('renders each legal page with its real title text', async () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['/privacy', enLegal.privacy.title],
      ['/terms', enLegal.terms.title],
      ['/data-deletion', enLegal.data_deletion.title],
    ];
    for (const [path, title] of cases) {
      const result = await prerender({ url: path });
      expect(result.html, path).toContain(title);
      expect(result.head.title, path).toBe(getRouteHead(path)!.title);
    }
  });

  it('injects the per-route canonical into the head elements', async () => {
    for (const path of PUBLIC_ROUTE_PATHS) {
      const result = await prerender({ url: path });
      const canonical = [...result.head.elements].find(
        (el) => el.type === 'link' && el.props.rel === 'canonical',
      );
      expect(canonical?.props.href, path).toBe(getRouteHead(path)!.canonical);
    }
  });

  it('reports every public route as a link so the plugin prerenders all of them', async () => {
    const result = await prerender({ url: '/' });
    expect([...result.links].sort()).toEqual([...PUBLIC_ROUTE_PATHS].sort());
  });

  it('does NOT render the WebGL scene into the static HTML (lazy hero stays lazy)', async () => {
    const result = await prerender({ url: '/' });
    expect(result.html).not.toContain('<canvas');
    // The SSR gate must take the STATIC branch: if the animated wrapper renders
    // instead, React.lazy initiates the three.js/R3F chunk import in Node and
    // its scheduler MessageChannel keeps `vite build` from ever exiting.
    expect(result.html).toContain('hero-forcefield-static');
    expect(result.html).not.toContain('data-testid="hero-forcefield"');
  });

  it('falls back to the landing shell for an unknown (private/SPA) url', async () => {
    const result = await prerender({ url: '/dashboard' });
    expect(result.html).toContain(enLanding.hero.headline);
    // ...but never claims a private canonical.
    const canonical = [...result.head.elements].find(
      (el) => el.type === 'link' && el.props.rel === 'canonical',
    );
    expect(canonical?.props.href).toBe(getRouteHead('/')!.canonical);
  });
});
