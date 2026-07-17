// Build-time helpers for `yogaWasmAssetPlugin` (vite.config.ts).
//
// yoga-layout (the @react-pdf layout engine) ships its wasm EMBEDDED in JS as
// a base64 `data:application/octet-stream` URI (emscripten SINGLE_FILE) whose
// loader fetch()es that URI at init. Our production CSP has no `data:` in
// connect-src, so the fetch is blocked (console errors on every live PDF
// generation) and emscripten falls back to a sync base64 decode. These helpers
// let the build lift the binary out into a real content-hashed asset served
// from our own origin instead. Tested in yogaWasmAsset.test.ts against the
// REAL installed module, so a yoga-layout upgrade that changes the embedding
// shape fails the unit suite with an actionable message.
import { createRequire } from 'node:module';
import path from 'node:path';

/** The one module inside yoga-layout that embeds the wasm as a data URI. */
const YOGA_WASM_MODULE_SUFFIX = ['yoga-layout', 'dist', 'binaries', 'yoga-wasm-base64-esm.js'];

/** Exactly one quoted `data:application/octet-stream;base64,…` token. */
const DATA_URI_TOKEN = /(["'])data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)\1/g;

export interface ExtractedYogaWasm {
  /** The exact quoted data-URI token, suitable for a single string replace(). */
  readonly quotedDataUri: string;
  /** The decoded wasm binary (starts with the `\0asm` magic). */
  readonly bytes: Uint8Array;
}

/** True when a bundler module id (query suffix allowed) is yoga's wasm module. */
export function isYogaWasmModuleId(id: string): boolean {
  const cleanPath = id.split('?', 1)[0];
  const normalized = cleanPath.split(path.sep).join('/');
  return normalized.endsWith(YOGA_WASM_MODULE_SUFFIX.join('/'));
}

/**
 * Resolve the installed yoga-wasm module through the same dependency chain the
 * bundler follows (app -> @react-pdf/renderer -> @react-pdf/layout ->
 * yoga-layout). Deep-resolving `yoga-layout/dist/...` directly is blocked by
 * its package `exports` map, so step to `yoga-layout/load` and walk over.
 */
export function resolveYogaWasmModulePath(appDir: string): string {
  const rendererPath = createRequire(path.join(appDir, 'package.json')).resolve(
    '@react-pdf/renderer',
  );
  const layoutPath = createRequire(rendererPath).resolve('@react-pdf/layout');
  const loadPath = createRequire(layoutPath).resolve('yoga-layout/load');
  return path.resolve(path.dirname(loadPath), '../binaries/yoga-wasm-base64-esm.js');
}

/**
 * Extract the embedded wasm binary from the module source. Throws with an
 * actionable message when the embedding shape changed (fail closed: never let
 * the data:-URI fetch path silently return).
 */
export function extractYogaWasm(source: string): ExtractedYogaWasm {
  const matches = [...source.matchAll(DATA_URI_TOKEN)];
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one embedded data:application/octet-stream URI in the ` +
        `yoga-layout wasm module, found ${matches.length} — yoga-layout changed its ` +
        `wasm embedding; update yogaWasmAssetPlugin/yogaWasmAsset.ts accordingly`,
    );
  }
  const [quotedDataUri, , base64] = matches[0];
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  const isWasm =
    bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
  if (!isWasm) {
    throw new Error(
      'the embedded yoga-layout data URI did not decode to a wasm binary ' +
        '(missing \\0asm magic) — refusing to emit a corrupt asset',
    );
  }
  return { quotedDataUri, bytes };
}
