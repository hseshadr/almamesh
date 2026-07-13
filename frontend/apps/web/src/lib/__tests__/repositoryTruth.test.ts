import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../../..');
const readRoot = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('repository truth', () => {
  it('prints architecture paths that exist exactly as written', () => {
    const readme = readRoot('README.md');
    const paths = [
      'frontend/apps/web',
      'frontend/packages/browser',
      'frontend/packages/store',
      'frontend/packages/llm',
      'frontend/packages/shared-types',
      'frontend/packages/constants',
      'frontend/packages/memory',
      'frontend/packages/edgeproc-browser',
      'backend/src/almamesh',
    ];
    for (const path of paths) {
      expect(readme).toContain(path);
      expect(existsSync(resolve(root, path))).toBe(true);
    }
  });

  it('describes PDF and network behavior without contradictions', () => {
    const readme = readRoot('README.md');
    expect(readme).toContain('deterministic report is available without AI');
    expect(readme).toContain('online-primary birthplace search with a bundled offline fallback');
    expect(readme).toContain('chart computation remains local and deterministic');
    expect(readme).not.toContain('It stays disabled until a real interpretation has completed');
    expect(readme).not.toContain('birth location with zero network');
  });

  it('records the complete PR 62 artifact and provenance behavior', () => {
    const changelog = readRoot('CHANGELOG.md');
    for (const claim of [
      'maha, antar, and pratyantar',
      'predictive cache identity',
      'interpretation provenance',
      'conservative life-event structuring',
      'semantic, geometric, and browser PDF gates',
    ]) expect(changelog).toContain(claim);
  });

  it.each([
    ['docs/specs/054-karma-action-classification.md', 'ROADMAP'],
    ['docs/specs/057-karma-gamification-ui.md', 'ROADMAP'],
    ['docs/specs/058-dasha-modifier-config.md', 'ROADMAP'],
    ['docs/specs/059-event-based-rectification.md', 'SHIPPED'],
    ['docs/specs/059-event-based-rectification-plan.md', 'SHIPPED'],
    ['docs/specs/060-conversational-rectification-elicitation.md', 'SHIPPED'],
    ['docs/specs/061-backup-restore-your-data.md', 'SHIPPED'],
    ['docs/specs/062-robust-rectifier-comprehensive-report.md', 'SHIPPED'],
    ['docs/specs/063-ai-tiers-ondevice-optin.md', 'SUPERSEDED'],
    ['docs/specs/064-seo-prerender-public-routes.md', 'SHIPPED'],
    ['docs/specs/SPEC-COMPLETION-TRACKING.md', 'SUPERSEDED'],
    ['docs/rigor-upgrade-spec.md', 'ROADMAP'],
  ])('%s has an explicit lifecycle', (path, lifecycle) => {
    expect(readRoot(path).slice(0, 500)).toContain(`**Lifecycle:** ${lifecycle}`);
  });
});
