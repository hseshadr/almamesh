#!/usr/bin/env node
// Build this app TWICE, into dist-sw-update/{a,b}, for the service-worker
// update gate (e2e/sw-update.e2e.spec.ts).
//
// The gate has to answer "after a deploy, does clicking the banner actually put
// the user on the new build?", and that question only exists when two builds of
// the same app disagree — different entry-chunk hashes, different sw.js, and a
// different precache manifest. One `dist` cannot express it.
//
// Build B bumps the package version, which is inlined as `__APP_VERSION__` and
// so changes the entry chunk hash. That is what a release does anyway; nothing
// here is synthetic. The version is restored afterwards, including on failure.
//
// Usage:  node scripts/build-sw-update-fixtures.mjs

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(appDir, 'dist');
const outDir = path.join(appDir, 'dist-sw-update');
const packageJsonPath = path.join(appDir, 'package.json');

const originalPackageJson = readFileSync(packageJsonPath, 'utf8');

function build(label) {
  console.log(`\n=== building fixture "${label}" ===`);
  execFileSync('bun', ['run', 'build'], {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: '', VITE_EXIT_GATE_HOOKS: '' },
  });
  const target = path.join(outDir, label);
  rmSync(target, { recursive: true, force: true });
  cpSync(distDir, target, { recursive: true });
  const html = readFileSync(path.join(target, 'index.html'), 'utf8');
  const entry = html.match(/<script[^>]+src="(\/assets\/index-[^"]+)"/)?.[1];
  console.log(`fixture "${label}" entry chunk: ${entry}`);
  return entry;
}

function setVersion(version) {
  const pkg = JSON.parse(originalPackageJson);
  pkg.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

mkdirSync(outDir, { recursive: true });

let entryA;
let entryB;
try {
  entryA = build('a');
  setVersion(`${JSON.parse(originalPackageJson).version}-sw-update-fixture`);
  entryB = build('b');
} finally {
  writeFileSync(packageJsonPath, originalPackageJson);
}

if (!entryA || !entryB || entryA === entryB) {
  throw new Error(
    `the two fixtures must differ — got a=${entryA} b=${entryB}. ` +
      'A gate where both builds are identical proves nothing.',
  );
}
console.log(`\nfixtures ready in ${outDir} (a=${entryA}, b=${entryB})`);
