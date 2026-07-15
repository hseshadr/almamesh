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
const appShellRoutes = [
  '/onboarding',
  '/dashboard',
  '/predictive',
  '/life/career',
  '/life/finances',
  '/life/health',
  '/life/relationships',
  '/life/spiritual',
  '/life/education',
  '/life/family',
  '/mesh',
  '/mesh/:memberId',
  '/rectify/:profileId',
  '/report',
  '/edit-birth-details',
  '/settings',
  '/settings/profile',
  '/settings/people',
  '/settings/ai',
  '/settings/preferences',
  '/settings/data',
] as const;

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

  it.each(['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot'])(
    'explicitly allows %s',
    (crawler) => {
      expect(robots).toMatch(new RegExp(`User-agent: ${crawler}\\nAllow: /(?:\\n|$)`));
    },
  );
});

describe('public/llms.txt', () => {
  it('provides factual product, privacy, source, and public-page context', () => {
    const llms = readFileSync(path.join(publicDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# AlmaMesh');
    expect(llms).toContain('https://github.com/hseshadr/almamesh');
    expect(llms).toContain('https://almamesh.com/privacy');
    expect(llms).toContain('browser');
    expect(llms).toContain('optional AI');
    expect(llms).not.toMatch(/guaranteed|scientifically proven|medical advice/i);
  });
});

describe('Cloudflare Pages route delivery', () => {
  const redirects = readFileSync(path.join(publicDir, '_redirects'), 'utf-8');

  it('rewrites every real client route without a blanket soft-404 fallback', () => {
    expect(redirects).not.toContain('/* /index.html 200');
    for (const route of appShellRoutes) {
      expect(redirects, route).toContain(`${route} / 200`);
    }
  });

  it('ships a branded noindex 404 document with one h1', () => {
    const notFound = readFileSync(path.join(publicDir, '404.html'), 'utf-8');
    expect(notFound).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["']noindex, nofollow["']/i);
    expect(notFound.match(/<h1(?:\s|>)/gi)).toHaveLength(1);
    expect(notFound).toContain('AlmaMesh');
    expect(notFound).toContain('href="/"');
  });

  it('limits the offline app-shell fallback to real routes', () => {
    const viteConfig = readFileSync(path.join(publicDir, '../vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain('navigateFallbackAllowlist');
    expect(viteConfig).not.toContain('navigateFallbackDenylist');
  });
});

describe('Cloudflare Pages security headers', () => {
  const headers = readFileSync(path.join(publicDir, '_headers'), 'utf-8');

  const catchAllBlock = headers.match(/^\/\*\r?\n((?:[ \t]+.*(?:\r?\n|$))+)/m)?.[1] ?? '';

  it('enforces a Pyodide, worker, Turnstile, and BYO-endpoint compatible CSP', () => {
    expect(headers).toContain('Content-Security-Policy:');
    expect(headers).toContain("script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com");
    expect(headers).toContain("worker-src 'self' blob:");
    expect(headers).toContain("frame-src 'self' https://challenges.cloudflare.com");
    expect(headers).toContain("connect-src 'self' https: http: ws: wss:");
    expect(headers).toContain("font-src 'self' data:");
  });

  it('enforces HTTPS after first secure contact', () => {
    expect(headers).toMatch(/Strict-Transport-Security:\s*max-age=\d+/);
  });

  it('disables browser capabilities the app does not use', () => {
    expect(headers).toMatch(/Permissions-Policy:/);
    for (const capability of ['camera=()', 'geolocation=()', 'microphone=()', 'payment=()']) {
      expect(headers, capability).toContain(capability);
    }
  });

  it('prevents edge transforms from injecting third-party scripts into app HTML', () => {
    expect(catchAllBlock).not.toBe('');
    expect(catchAllBlock).toContain('Cache-Control: public, no-cache, no-transform');
  });
});

describe('HTML heading contract', () => {
  it('does not add a second h1 from the noscript fallback', () => {
    const template = readFileSync(path.join(publicDir, '../index.html'), 'utf-8');
    const noscript = template.match(/<noscript>([\s\S]*?)<\/noscript>/i)?.[1] ?? '';
    expect(noscript).not.toMatch(/<h1(?:\s|>)/i);
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
