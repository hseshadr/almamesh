// @vitest-environment node
//
// Locks the build-time extraction of yoga-layout's embedded wasm.
//
// WHY THIS EXISTS: @react-pdf (the report-PDF pipeline) computes page layout
// with yoga-layout, whose npm build ships the wasm embedded as a base64
// `data:application/octet-stream` URI (emscripten SINGLE_FILE) and fetch()es
// that URI at init. The production CSP (`public/_headers`) rightly has no
// `data:` in connect-src, so every live PDF generation logged blocked-fetch
// console errors before falling back to a sync base64 decode. The
// `yogaWasmAssetPlugin` in vite.config.ts uses these helpers to lift the
// binary out into a real content-hashed asset served from our own origin.
//
// These tests run against the REAL yoga-layout module resolved through the
// same dependency chain the bundler uses, so a yoga-layout upgrade that
// changes the embedding shape fails HERE with a clear message instead of
// silently shipping the data:-URI fetch noise back to production.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  extractYogaWasm,
  isYogaWasmModuleId,
  resolveYogaWasmModulePath,
} from './yogaWasmAsset';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('resolveYogaWasmModulePath', () => {
  it('resolves the real yoga-layout wasm module through the @react-pdf chain', () => {
    const modulePath = resolveYogaWasmModulePath(appDir);
    expect(existsSync(modulePath), modulePath).toBe(true);
    expect(isYogaWasmModuleId(modulePath)).toBe(true);
  });
});

describe('isYogaWasmModuleId', () => {
  it('rejects unrelated module ids', () => {
    expect(isYogaWasmModuleId('/x/node_modules/react/index.js')).toBe(false);
    expect(isYogaWasmModuleId('/x/yoga-wasm-base64-esm.js')).toBe(false);
  });

  it('accepts the module id with a bundler query suffix', () => {
    const modulePath = resolveYogaWasmModulePath(appDir);
    expect(isYogaWasmModuleId(`${modulePath}?v=abc123`)).toBe(true);
  });
});

describe('extractYogaWasm', () => {
  const source = readFileSync(resolveYogaWasmModulePath(appDir), 'utf-8');

  it('extracts a genuine wasm binary from the real module', () => {
    const { bytes } = extractYogaWasm(source);
    // WebAssembly magic: \0asm.
    expect([...bytes.slice(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    // The layout engine is non-trivial; a tiny blob means the regex grabbed junk.
    expect(bytes.byteLength).toBeGreaterThan(50_000);
  });

  it('returns the exact quoted data-URI token so a replace() strips it fully', () => {
    const { quotedDataUri } = extractYogaWasm(source);
    expect(source.split(quotedDataUri).length - 1).toBe(1); // exactly one occurrence
    const stripped = source.replace(quotedDataUri, '__WASM_URL__');
    // No PAYLOAD-carrying data URI may remain (emscripten's bare
    // `dataURIPrefix` constant — the prefix with no payload, used only by its
    // isDataURI() check — legitimately stays behind).
    expect(stripped).not.toMatch(/data:application\/octet-stream;base64,[A-Za-z0-9+/]/);
  });

  it('fails loudly when the module no longer embeds a data URI', () => {
    expect(() => extractYogaWasm('export default function(){}')).toThrow(/yoga-layout/);
  });

  it('fails loudly on an ambiguous module with two embedded URIs', () => {
    const uri = '"data:application/octet-stream;base64,AGFzbQ=="';
    expect(() => extractYogaWasm(`${uri};${uri}`)).toThrow(/exactly one/i);
  });
});
