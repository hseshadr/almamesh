// Build-time guard for `noSourcemapsPlugin` (vite.config.ts).
//
// WHY THIS EXISTS: almamesh.com shipped `assets/index-*.js.map` (2.76 MB,
// served with `content-type: application/json`) carrying `sourcesContent` for
// 334 sources — including 51 first-party TypeScript files with their full
// original source. Cloudflare Pages serves whatever is in the output directory,
// so a `_headers` rule cannot un-serve a map: the only fix is to not emit it.
//
// `build.sourcemap: false` does that, but a flag is a shape, not a property.
// This guard checks the PROPERTY — that the bundle Rollup is about to write
// contains no sourcemap — so flipping the flag back, or a plugin that turns
// maps on behind our back, fails the build instead of quietly republishing the
// source. Pure and injectable so the red case is unit-testable without a build.

/** The subset of a Rollup output entry this guard needs to judge. */
export interface EmittedArtifact {
  readonly fileName: string;
  /** True when the entry is a chunk carrying an attached sourcemap. */
  readonly carriesSourcemap: boolean;
}

/**
 * Names of every artifact that would publish source: a standalone `.map` file,
 * or a chunk with a sourcemap attached (which Rollup writes out as `.map`).
 * Empty result = the build emits no source.
 */
export function selectSourcemapArtifacts(artifacts: readonly EmittedArtifact[]): string[] {
  return artifacts
    .filter((a) => a.fileName.endsWith('.map') || a.carriesSourcemap)
    .map((a) => a.fileName)
    .sort();
}

/** Actionable failure text naming the offenders and the one-line fix. */
export function sourcemapLeakMessage(fileNames: readonly string[]): string {
  return (
    `Production sourcemaps would be published: ${fileNames.join(', ')}. ` +
    `Cloudflare Pages serves every file in the output directory, so these expose ` +
    `the full original TypeScript source. Set build.sourcemap: false in ` +
    `vite.config.ts (see src/lib/noSourcemaps.ts for why this guard exists).`
  );
}
