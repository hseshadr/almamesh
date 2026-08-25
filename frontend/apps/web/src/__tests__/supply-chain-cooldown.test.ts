import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Release timing is not a trust boundary. AlmaMesh accepts exact registry
// artifacts immediately and verifies them through frozen locks, integrity data,
// provenance contracts, and unsuppressed audits.

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNFIG_PATH = resolve(HERE, '../../../../bunfig.toml');

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
});
