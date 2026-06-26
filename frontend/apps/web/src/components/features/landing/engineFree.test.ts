import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Engine-respect invariant (spec: Global Constraints): no landing module may
 * import `@almamesh/browser` at RUNTIME — only `import type` (fully erased at
 * build) is allowed. A runtime import would risk pulling the ~38 MB Pyodide
 * engine into the landing chunk, defeating the "costs a bouncing visitor
 * nothing" guarantee. We scan the source of every landing module and the page
 * + hooks/fixtures it depends on.
 */
const LANDING_SOURCES = [
  ...readdirSync(here)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.tsx') && !f.endsWith('.test.ts'))
    .map((f) => join(here, f)),
  join(here, '../../../pages/Landing.tsx'),
  join(here, '../../../hooks/usePrewarmEngineOnIntent.ts'),
  join(here, '../../../lib/demoChart.ts'),
];

// A runtime import names the engine package WITHOUT the leading `type` keyword
// and WITHOUT the `/types` runtime-free type barrel.
const RUNTIME_BROWSER_IMPORT = /import\s+(?!type\b)[^;]*from\s+['"]@almamesh\/browser(?!\/types)['"]/;

describe('landing chunk is engine-free', () => {
  it.each(LANDING_SOURCES)('%s has no runtime @almamesh/browser import', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(RUNTIME_BROWSER_IMPORT.test(src)).toBe(false);
  });
});
