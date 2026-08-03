import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guard for the supply-chain cooldown declared in frontend/bunfig.toml.
//
// `install.minimumReleaseAge` makes `bun install` refuse a package version
// published less than 24h ago — the window in which a compromised release is
// live and usually not yet caught. Bun ships this DISABLED by default (`null`),
// so unlike the pnpm consumers in this portfolio, almamesh gets no cooldown
// unless the key is present. Deleting the file or the key silently removes the
// control and nothing else in the build would notice. This test notices.
//
// Two properties are pinned:
//   1. The threshold is exactly 86400 seconds. Bun counts SECONDS where pnpm
//      counts MINUTES, so the portfolio-wide 1440-minute cooldown is 86400 here.
//      Writing `1440` in this file would be a 24-MINUTE cooldown that still
//      looks correct next to aml-filter's and edge-reco's pnpm-workspace.yaml.
//   2. No `minimumReleaseAgeExcludes` list is active. An exemption permanently
//      disables the cooldown for the listed packages, in CI too. A dependency
//      tripping the cooldown is the control working — wait the window out or
//      pin the previous version; never carve the package out. First-party
//      packages are not a safe carve-out either: carving out first-party refs
//      is precisely what concealed a live supply-chain gap in a sibling repo.

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNFIG_PATH = resolve(HERE, '../../../../bunfig.toml');

/** The portfolio-wide cooldown, as the pnpm consumers declare it. */
const COOLDOWN_MINUTES = 1440;
/** The same cooldown in bun's unit. Pinned as a literal, not derived, so a
 *  wrong unit in bunfig.toml cannot be "confirmed" by the same wrong maths. */
const COOLDOWN_SECONDS = 86400;

const EXEMPTION_KEY = 'minimumReleaseAgeExcludes';

/** Lines with the `#` comment marker stripped, so prose ABOUT a key is never
 *  mistaken for the key being set. bunfig.toml is TOML: `#` starts a comment. */
function activeLines(toml: string): string[] {
  return toml
    .split('\n')
    .map((line) => line.split('#')[0].trim())
    .filter((line) => line.length > 0);
}

function readBunfig(): string {
  return readFileSync(BUNFIG_PATH, 'utf8');
}

describe('supply-chain cooldown (bunfig.toml install.minimumReleaseAge)', () => {
  it('declares the cooldown under [install]', () => {
    const lines = activeLines(readBunfig());
    expect(lines).toContain('[install]');
    expect(lines.some((line) => line.startsWith('minimumReleaseAge'))).toBe(true);
  });

  it('sets the cooldown to exactly 86400 seconds (= 1440 minutes)', () => {
    const active = activeLines(readBunfig()).join('\n');
    const match = active.match(/^minimumReleaseAge\s*=\s*(\d+)$/m);
    expect(match, `no active minimumReleaseAge in ${BUNFIG_PATH}`).not.toBeNull();

    const seconds = Number(match![1]);
    // Pin the literal the docs promise...
    expect(seconds).toBe(COOLDOWN_SECONDS);
    // ...and pin that the literal really is the portfolio's 1440 minutes,
    // which is what catches a minutes-for-seconds unit slip.
    expect(seconds).toBe(COOLDOWN_MINUTES * 60);
    expect(seconds / 3600).toBe(24);
  });

  it('has no active exemption list', () => {
    const offenders = activeLines(readBunfig()).filter((line) =>
      line.startsWith(EXEMPTION_KEY),
    );
    expect(
      offenders,
      [
        `An active \`${EXEMPTION_KEY}\` was found in ${BUNFIG_PATH}.`,
        '',
        'WHAT IT DOES: permanently exempts the listed packages from the 24h',
        'cooldown — on every install, CI included. A compromised fresh release',
        'of an exempted package then installs without resistance.',
        '',
        'HOW TO FIX: delete the key. If a dependency is tripping the cooldown,',
        'that is the control working. Wait the 24h out, or pin the previous',
        'version. Do not carve the package out — not even a first-party one.',
      ].join('\n'),
    ).toEqual([]);
  });

  // The two tests above are only as good as `activeLines`. This file's own
  // bunfig.toml discusses `minimumReleaseAgeExcludes` in prose; if comment
  // stripping were broken the exemption test would fail on the documentation,
  // and — worse — a real exemption hidden after an inline comment would pass.
  it('tells a commented-out exemption apart from a live one', () => {
    const commented = `[install]\n# ${EXEMPTION_KEY} = ["left-pad"]\nminimumReleaseAge = 86400`;
    const live = `[install]\n${EXEMPTION_KEY} = ["left-pad"]\nminimumReleaseAge = 86400`;

    expect(activeLines(commented).some((l) => l.startsWith(EXEMPTION_KEY))).toBe(false);
    expect(activeLines(live).some((l) => l.startsWith(EXEMPTION_KEY))).toBe(true);
  });

  it('reads a threshold written with a trailing inline comment', () => {
    const withComment = '[install]\nminimumReleaseAge = 86400 # 1440 minutes\n';
    const active = activeLines(withComment).join('\n');
    expect(active.match(/^minimumReleaseAge\s*=\s*(\d+)$/m)?.[1]).toBe('86400');
  });
});
