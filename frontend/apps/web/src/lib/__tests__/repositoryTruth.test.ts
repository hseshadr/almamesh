import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../../..');
const readRoot = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const readSection = (document: string, heading: string): string => {
  const start = document.indexOf(heading);
  if (start < 0) throw new Error(`Missing section: ${heading}`);
  const end = document.indexOf('\n## ', start + heading.length);
  return document.slice(start, end < 0 ? undefined : end);
};

describe('repository truth', () => {
  it('prints architecture paths that exist exactly as written', () => {
    const architecture = readSection(readRoot('README.md'), '## Architecture');
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
      expect(architecture).toContain(path);
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
    const unreleased = readSection(readRoot('CHANGELOG.md'), '## [Unreleased]');
    for (const claim of [
      'maha, antar, and pratyantar',
      'predictive cache identity',
      'interpretation provenance',
      'conservative life-event structuring',
      'semantic, geometric, and browser PDF gates',
    ]) expect(unreleased).toContain(claim);
  });

  it('dates the report baseline to v0.4.0 and all-table completion to PR 62', () => {
    const spec = readRoot('docs/specs/062-robust-rectifier-comprehensive-report.md');
    expect(spec).toContain(
      '**Status:** The v0.4.0 baseline is shipped; complete all-table report export is Unreleased in PR #62.',
    );
    expect(spec).not.toContain('**Status:** Shipped in v0.4.0');
  });

  it('uses the Vite 8 JSX config without deprecated transform keys', () => {
    const config = readRoot('frontend/apps/web/vitest.config.ts');
    expect(config).toContain('oxc:');
    expect(config).toContain('rolldownOptions:');
    expect(config).not.toContain("import react from '@vitejs/plugin-react'");
    expect(config).not.toContain('react()');
    expect(config).not.toContain('esbuild:');
    expect(config).not.toContain('esbuildOptions:');
  });

  it('publishes the categorized cleverness-debt ledger', () => {
    const path = 'docs/CLEVERNESS-DEBT.md';
    expect(existsSync(resolve(root, path))).toBe(true);
    const ledger = readRoot(path);
    for (const heading of [
      '## Remove now',
      '## Redesign only with a named consumer',
      '## Accepted boundary',
    ]) expect(ledger).toContain(heading);
    for (const boundary of [
      'Skyfield type edge',
      'PEP 562 lazy import',
      'Shadbala classical-argument shape',
      'JSON metadata',
      'Downstream raw Skyfield position mappings',
      'worker singletons',
      'lazy-load cache',
      'chat cache',
      'geocoder cache',
      'mutable store counters',
    ]) expect(ledger).toContain(boundary);
    for (const evidence of [
      'transits/positions.py',
      'transits/aspects.py',
      'transits/gochara.py',
      'Before adding another consumer of `get_planetary_positions()`',
    ]) expect(ledger).toContain(evidence);
  });

  it('records rigor stages 1-4 as shipped without overstating empirical validity', () => {
    const rigor = readRoot('docs/rigor-upgrade-spec.md');
    for (const evidence of [
      'Stages 1–4 shipped',
      'PR #56',
      'PR #58',
      'PR #57',
      'PR #59',
      'historical design and acceptance rationale',
      'not empirically validated life outcomes',
    ]) expect(rigor).toContain(evidence);

    const yogaFactors = readRoot('backend/src/almamesh/yogas/factors.py');
    expect(yogaFactors).toContain('calibrated structural percentages');
    expect(yogaFactors).toContain('not empirically validated life outcomes');
    expect(yogaFactors).not.toContain('real factors, no percentages');

    const rectificationPdf = readRoot(
      'frontend/apps/web/src/components/report-pdf/sections/ReportPdfRectification.tsx',
    );
    expect(rectificationPdf).toContain('aggregate calibrated confidence percentage');
    expect(rectificationPdf).toContain('not a probability that the time is correct');
    expect(rectificationPdf).not.toContain('carries NO percentage');
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
    ['docs/rigor-upgrade-spec.md', 'SHIPPED'],
  ])('%s has an explicit lifecycle', (path, lifecycle) => {
    const [title, separator, banner] = readRoot(path).split('\n');
    expect(title).toMatch(/^# /);
    expect(separator).toBe('');
    expect(banner).toBe(`**Lifecycle:** ${lifecycle}`);
  });
});
