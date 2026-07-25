// @vitest-environment node
//
// Red-proof for the build guard that keeps production sourcemaps off
// almamesh.com. The RED cases below are the exact shapes the live site was
// serving before the fix (a standalone `assets/index-*.js.map`, and a chunk
// with a map attached); if `selectSourcemapArtifacts` ever stops flagging them,
// the guard in vite.config.ts is measuring nothing.
import { describe, it, expect } from 'vitest';

import {
  selectSourcemapArtifacts,
  sourcemapLeakMessage,
  type EmittedArtifact,
} from './noSourcemaps';

const chunk = (fileName: string, carriesSourcemap = false): EmittedArtifact => ({
  fileName,
  carriesSourcemap,
});

describe('selectSourcemapArtifacts', () => {
  it('passes a build that emits no source', () => {
    expect(
      selectSourcemapArtifacts([
        chunk('assets/index-BhSCnr0A.js'),
        chunk('assets/index-Bb8JjhAW.css'),
        chunk('assets/yoga-layout-a1b2c3d4.wasm'),
        chunk('index.html'),
      ]),
    ).toEqual([]);
  });

  it('flags a standalone .map file — the artifact almamesh.com was serving', () => {
    expect(
      selectSourcemapArtifacts([
        chunk('assets/index-BhSCnr0A.js'),
        chunk('assets/index-BhSCnr0A.js.map'),
      ]),
    ).toEqual(['assets/index-BhSCnr0A.js.map']);
  });

  it('flags a chunk carrying an attached sourcemap, even with no .map entry', () => {
    expect(selectSourcemapArtifacts([chunk('assets/index-BhSCnr0A.js', true)])).toEqual([
      'assets/index-BhSCnr0A.js',
    ]);
  });

  it('reports every offender, sorted, so the failure names them all', () => {
    expect(
      selectSourcemapArtifacts([
        chunk('workbox-a85f4708.js.map'),
        chunk('assets/ReportView-CVYLaCxI.js.map'),
        chunk('sw.js.map'),
      ]),
    ).toEqual(['assets/ReportView-CVYLaCxI.js.map', 'sw.js.map', 'workbox-a85f4708.js.map']);
  });

  it('does not mistake a name that merely contains "map" for a sourcemap', () => {
    expect(
      selectSourcemapArtifacts([chunk('assets/mapView-Ab12Cd34.js'), chunk('assets/sitemap.xml')]),
    ).toEqual([]);
  });
});

describe('sourcemapLeakMessage', () => {
  it('names the offenders and the one-line fix', () => {
    const message = sourcemapLeakMessage(['assets/index-BhSCnr0A.js.map']);
    expect(message).toContain('assets/index-BhSCnr0A.js.map');
    expect(message).toContain('build.sourcemap: false');
  });
});
