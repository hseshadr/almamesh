// @vitest-environment node
//
// Locks the deploy-facing SEO files to the typed route source (routeHead.ts):
//   - public/sitemap.xml lists exactly the public canonicals
//   - public/robots.txt allows crawling, disallows every private prefix,
//     and points at the sitemap
//   - the IndexNow key file exists and matches the key the deploy workflow pings
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { PUBLIC_ROUTE_HEADS, PRIVATE_ROUTE_PREFIXES, SITE_ORIGIN } from './routeHead';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public');
const repoRoot = path.resolve(here, '../../../../..');

describe('public/sitemap.xml', () => {
  const xml = readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf-8');

  it('is a urlset with exactly the public canonicals', () => {
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(PUBLIC_ROUTE_HEADS.map((h) => h.canonical).sort());
  });

  it('is well-formed XML (tags balance, single root)', () => {
    expect(xml.trimStart().startsWith('<?xml')).toBe(true);
    const opens = (xml.match(/<url>/g) ?? []).length;
    const closes = (xml.match(/<\/url>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBe(PUBLIC_ROUTE_HEADS.length);
    expect((xml.match(/<urlset/g) ?? []).length).toBe(1);
  });
});

describe('public/robots.txt', () => {
  const robots = readFileSync(path.join(publicDir, 'robots.txt'), 'utf-8');

  it('has a wildcard group that allows crawling', () => {
    expect(robots).toMatch(/User-agent: \*\nAllow: \//);
  });

  it('disallows every private app prefix', () => {
    for (const prefix of PRIVATE_ROUTE_PREFIXES) {
      expect(robots, prefix).toContain(`Disallow: ${prefix}`);
    }
  });

  it('never disallows a public route', () => {
    for (const head of PUBLIC_ROUTE_HEADS) {
      if (head.path === '/') continue;
      expect(robots).not.toContain(`Disallow: ${head.path}`);
    }
  });

  it('points at the sitemap', () => {
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });
});

describe('IndexNow key', () => {
  const keyFiles = readdirSync(publicDir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));

  it('exactly one key file exists and contains its own key', () => {
    expect(keyFiles).toHaveLength(1);
    const key = keyFiles[0].replace(/\.txt$/, '');
    expect(readFileSync(path.join(publicDir, keyFiles[0]), 'utf-8').trim()).toBe(key);
  });

  it('the deploy workflow pings api.indexnow.org, deriving the key from the shipped file', () => {
    const workflow = readFileSync(
      path.join(repoRoot, '.github/workflows/deploy.yml'),
      'utf-8',
    );
    expect(workflow).toContain('api.indexnow.org');
    // No key literal in the workflow (gitleaks false-positives on inline hex
    // keys): it must derive the key from the key file shipped in public/.
    expect(workflow).toContain("grep -E '^[0-9a-f]{32}\\.txt$'");
    expect(workflow).toContain('frontend/apps/web/public');
    const key = keyFiles[0].replace(/\.txt$/, '');
    expect(workflow).not.toContain(key);
    for (const head of PUBLIC_ROUTE_HEADS) {
      expect(workflow, head.canonical).toContain(head.canonical);
    }
    // Non-fatal by contract: the ping must never break a deploy.
    expect(workflow).toMatch(/indexnow[\s\S]{0,400}\|\| true/i);
  });
});
