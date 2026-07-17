// @vitest-environment node
//
// Locks the parser that lifts the production Content-Security-Policy out of
// `public/_headers` (the Cloudflare Pages header file) for `vite preview`.
//
// WHY THIS EXISTS: in production Cloudflare parses `_headers`; plain
// `vite preview` serves NO CSP, so every preview-driven e2e lane used to run
// with a materially looser policy than production. A CSP-blocked fetch (the
// yoga-layout data:-URI wasm fetch) sailed through CI green and only surfaced
// as console errors on almamesh.com. `previewProdCspPlugin` in vite.config.ts
// applies the REAL header to preview responses; this test pins the parse
// against the real file so drift fails loudly.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { cspFromHeadersFile } from './previewHeaders';

const here = path.dirname(fileURLToPath(import.meta.url));
const headersPath = path.resolve(here, '../../public/_headers');

describe('cspFromHeadersFile', () => {
  it('extracts the production CSP from the real public/_headers', () => {
    const csp = cspFromHeadersFile(readFileSync(headersPath, 'utf-8'));
    expect(csp.startsWith("default-src 'self'")).toBe(true);
    // The clause whose absence of `data:` makes the yoga wasm regression
    // reproducible under preview — the whole point of applying CSP there.
    expect(csp).toContain("connect-src 'self' https: http:");
    expect(csp).not.toContain('\n');
  });

  it('ignores detach markers and unrelated headers inside the catch-all block', () => {
    const csp = cspFromHeadersFile(
      [
        '/*',
        '  ! Access-Control-Allow-Origin',
        '  X-Frame-Options: DENY',
        "  Content-Security-Policy: default-src 'self'",
        '',
      ].join('\n'),
    );
    expect(csp).toBe("default-src 'self'");
  });

  it('only reads the catch-all /* block, never a path-specific one', () => {
    expect(() =>
      cspFromHeadersFile(
        ['/assets/*', "  Content-Security-Policy: default-src 'none'", ''].join('\n'),
      ),
    ).toThrow(/\/\*/);
  });

  it('fails loudly when the catch-all block lacks a CSP', () => {
    expect(() => cspFromHeadersFile(['/*', '  X-Frame-Options: DENY', ''].join('\n'))).toThrow(
      /Content-Security-Policy/,
    );
  });
});
