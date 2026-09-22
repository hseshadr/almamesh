// Build-time helpers for `previewProdBrowserHeadersPlugin` (vite.config.ts).
//
// `public/_headers` is Cloudflare Pages' header file — production parses it,
// but plain `vite preview` serves NO CSP, leaving every preview-driven e2e
// lane looser than production (a CSP-blocked fetch passed CI green and only
// erred live). This parser lifts the catch-all `/*` block's
// browser-security headers so preview can serve the REAL production policy.
// Tested in previewHeaders.test.ts against the real file.

type BrowserIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin';
  'Cross-Origin-Embedder-Policy': 'require-corp';
};

function catchAllHeader(headersFileContent: string, headerName: string): string {
  const lines = headersFileContent.split('\n');
  const start = lines.findIndex((line) => line.trim() === '/*');
  if (start === -1) {
    throw new Error('public/_headers has no catch-all `/*` rule — cannot derive browser headers');
  }

  const escapedName = headerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s+${escapedName}:\\s*(.+?)\\s*$`, 'i');
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break; // un-indented line ends the /* block
    const header = line.match(pattern);
    if (header) return header[1];
  }
  throw new Error(`the \`/*\` rule in public/_headers carries no ${headerName}`);
}

/**
 * Return the Content-Security-Policy value of the catch-all `/*` rule.
 * Fails closed: a missing block or missing CSP throws (never a silent,
 * CSP-less preview that would blind the clean-console e2e gates).
 */
export function cspFromHeadersFile(headersFileContent: string): string {
  return catchAllHeader(headersFileContent, 'Content-Security-Policy');
}

/**
 * Production's HTTPS transport directive makes WebKit rewrite even trustworthy
 * localhost HTTP subresources to HTTPS, where Vite has no TLS listener. Keep
 * every enforcement directive in local preview and omit only that HTTPS-origin
 * no-op so WebKit can exercise the real app rather than a scriptless shell.
 */
export function cspForLocalHttpPreview(headersFileContent: string): string {
  return cspFromHeadersFile(headersFileContent)
    .replace(/(?:^|;)\s*upgrade-insecure-requests\s*(?=;|$)/i, '')
    .replace(/^;\s*|;\s*$/g, '')
    .trim();
}

/**
 * Return the exact COOP/COEP pair needed for SharedArrayBuffer-backed OPFS.
 * Values fail closed so local preview cannot silently diverge from deployment.
 */
export function browserIsolationHeadersFromHeadersFile(
  headersFileContent: string,
): BrowserIsolationHeaders {
  const coop = catchAllHeader(headersFileContent, 'Cross-Origin-Opener-Policy');
  if (coop !== 'same-origin') {
    throw new Error(
      `Cross-Origin-Opener-Policy must be same-origin for browser isolation (received ${coop})`,
    );
  }

  const coep = catchAllHeader(headersFileContent, 'Cross-Origin-Embedder-Policy');
  if (coep !== 'require-corp') {
    throw new Error(
      `Cross-Origin-Embedder-Policy must be require-corp for portable browser isolation (received ${coep})`,
    );
  }

  return {
    'Cross-Origin-Opener-Policy': coop,
    'Cross-Origin-Embedder-Policy': coep,
  };
}
