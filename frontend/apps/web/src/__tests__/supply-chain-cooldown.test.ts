import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Release timing is not a trust boundary. AlmaMesh accepts exact registry
// artifacts immediately and verifies them through frozen locks, integrity data,
// provenance contracts, and unsuppressed audits.

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNFIG_PATH = resolve(HERE, '../../../../bunfig.toml');
const BROWSER_PACKAGE_PATH = resolve(HERE, '../../../../packages/browser/package.json');
const BUN_LOCK_PATH = resolve(HERE, '../../../../bun.lock');
const ASSAY_VERSION = '0.5.0-dev.3';
const ASSAY_SRI =
  'sha512-s0NBvvTvbc7Y6z50oqaIPraN0hd6RRd9vY4dPXkWpB3DTGKCuJ8c4Kz2eX1KjEqF7PecQ4FyqzAYvgxIrJsQYg==';

function activeLines(toml: string): string[] {
  return toml
    .split('\n')
    .map((line) => line.split('#')[0].trim())
    .filter((line) => line.length > 0);
}

function readBunfig(): string {
  return existsSync(BUNFIG_PATH) ? readFileSync(BUNFIG_PATH, 'utf8') : '';
}

describe('registry dependency timing policy', () => {
  it('does not delay exact registry artifacts based on publication age', () => {
    const releaseAgePolicy = activeLines(readBunfig()).filter((line) =>
      line.startsWith('minimumReleaseAge'),
    );
    expect(releaseAgePolicy).toEqual([]);
  });

  it('pins the reviewed Assay npm artifact and registry integrity', () => {
    const manifest = JSON.parse(readFileSync(BROWSER_PACKAGE_PATH, 'utf8'));
    const lock = readFileSync(BUN_LOCK_PATH, 'utf8');
    expect(manifest.dependencies?.['@edgeproc/assay']).toBe(ASSAY_VERSION);
    expect(lock).toContain(`"@edgeproc/assay": ["@edgeproc/assay@${ASSAY_VERSION}"`);
    expect(lock).toContain(`"${ASSAY_SRI}"`);
  });
});
