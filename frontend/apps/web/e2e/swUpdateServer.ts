// A two-build static origin for the service-worker update gate.
//
// WHY this exists instead of `vite preview`: the gate has to simulate a DEPLOY
// while a browser is already running the previous build — same origin, same
// URLs, different bytes. `vite preview` serves one `dist` from one process and
// cannot do that. This server serves whichever build directory it currently
// points at, and the spec flips that pointer mid-test (`deploy()`).
//
// It mirrors the three Cloudflare Pages behaviours the update path depends on:
//   - `sw.js`, `version.json` and HTML are revalidated (`no-cache`), so the
//     browser really re-fetches them and can notice a new worker;
//   - `/assets/*` is immutable, exactly as production serves content-hashed
//     chunks — so a stale client keeps its old chunks unless the SW changes;
//   - documents carry the REAL production CSP parsed out of `public/_headers`
//     (plain `vite preview` serves no CSP at all — a known blind spot here).

import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { cspFromHeadersFile } from '../src/lib/previewHeaders';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/** Content-hashed assets are immutable in production; everything else revalidates. */
function cacheControl(filePath: string): string {
  return /[/\\]assets[/\\]/.test(filePath)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/**
 * Map a request path to a file the way Cloudflare Pages does for this site:
 * a real file wins, then the flat prerendered route (`/welcome` ->
 * `welcome.html`), then the SPA fallback shell.
 */
function resolveFile(root: string, pathname: string): string | null {
  const relative = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const direct = path.join(root, relative);
  if (!direct.startsWith(root)) {
    return null; // path traversal
  }
  if (existsSync(direct) && statSync(direct).isFile()) {
    return direct;
  }
  const flat = `${direct.replace(/[/\\]$/, '')}.html`;
  if (existsSync(flat) && statSync(flat).isFile()) {
    return flat;
  }
  return path.extname(relative) ? null : path.join(root, 'index.html');
}

export interface TwoBuildServer {
  readonly origin: string;
  /** Point the origin at a different build directory — i.e. ship a deploy. */
  deploy(buildDir: string): void;
  close(): Promise<void>;
}

/** Start the origin serving `initialBuildDir` on `port`. */
export async function startTwoBuildServer(
  initialBuildDir: string,
  port: number,
): Promise<TwoBuildServer> {
  let root = initialBuildDir;
  const csp = cspFromHeadersFile(await readFile(path.join(initialBuildDir, '_headers'), 'utf8'));

  const server: Server = createServer((req, res) => {
    const file = resolveFile(root, (req.url ?? '/').split('?')[0]);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    readFile(file).then(
      (body) => {
        const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
        const headers: Record<string, string> = {
          'content-type': type,
          'cache-control': cacheControl(file),
        };
        if (type.startsWith('text/html')) {
          headers['content-security-policy'] = csp;
        }
        res.writeHead(200, headers);
        res.end(body);
      },
      () => {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('read error');
      },
    );
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    origin: `http://localhost:${port}`,
    deploy(buildDir: string) {
      root = buildDir;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
