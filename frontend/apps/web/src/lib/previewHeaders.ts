// Build-time helper for `previewProdCspPlugin` (vite.config.ts).
//
// `public/_headers` is Cloudflare Pages' header file — production parses it,
// but plain `vite preview` serves NO CSP, leaving every preview-driven e2e
// lane looser than production (a CSP-blocked fetch passed CI green and only
// erred live). This parser lifts the catch-all `/*` block's
// Content-Security-Policy so preview can serve the REAL production policy.
// Tested in previewHeaders.test.ts against the real file.

/**
 * Return the Content-Security-Policy value of the catch-all `/*` rule.
 * Fails closed: a missing block or missing CSP throws (never a silent,
 * CSP-less preview that would blind the clean-console e2e gates).
 */
export function cspFromHeadersFile(headersFileContent: string): string {
  const lines = headersFileContent.split('\n');
  const start = lines.findIndex((line) => line.trim() === '/*');
  if (start === -1) {
    throw new Error('public/_headers has no catch-all `/*` rule — cannot derive the preview CSP');
  }
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break; // un-indented line ends the /* block
    const header = line.match(/^\s+Content-Security-Policy:\s*(.+?)\s*$/i);
    if (header) return header[1];
  }
  throw new Error(
    'the `/*` rule in public/_headers carries no Content-Security-Policy — ' +
      'preview would silently run without the production CSP',
  );
}
