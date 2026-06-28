/**
 * Regression guard for the dark `color-scheme` declaration.
 *
 * The Observatory is a dark theme. Without a declared `color-scheme: dark`,
 * browsers paint native form controls (`<input type="date">`, `<select>`,
 * text inputs) with the default LIGHT scheme — a forced white background that
 * overrides `bg-surface-primary` and renders the light parchment text
 * (`text-text-primary`) invisible. That was the reported "Refine Your Birth
 * Time" unreadable-inputs bug (EventRow inputs in the rectification wizard).
 *
 * jsdom / happy-dom do NOT render native widget appearance, so a component test
 * cannot capture the white-background regression. Instead we assert the shipped
 * declarations exist:
 *   - `:root { color-scheme: dark }` in index.css (primary fix)
 *   - `<meta name="color-scheme" content="dark">` in index.html (pre-CSS)
 *   - `@media print` resets the paper report to `color-scheme: light`
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, '../index.css'), 'utf8');
const indexHtml = readFileSync(resolve(here, '../../index.html'), 'utf8');

describe('dark color-scheme declaration', () => {
  it('declares color-scheme: dark on :root in index.css', () => {
    // Tolerant of whitespace, requires the dark scheme on the root block.
    expect(indexCss).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark/);
  });

  it('declares <meta name="color-scheme" content="dark"> in index.html', () => {
    expect(indexHtml).toMatch(
      /<meta[^>]*name=["']color-scheme["'][^>]*content=["']dark["']/i,
    );
  });

  it('resets the paper report to color-scheme: light inside @media print', () => {
    const printBlock = indexCss.slice(indexCss.indexOf('@media print'));
    expect(printBlock).toMatch(/color-scheme:\s*light/);
  });
});
