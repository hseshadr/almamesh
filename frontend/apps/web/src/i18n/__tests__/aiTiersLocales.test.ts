/**
 * AI settings i18n — the OpenRouter-clarity settings redesign ships in en/es/pt
 * with full key-tree parity (en authoritative), and the on-device AI tier copy
 * has been removed everywhere it once appeared:
 *   - settings `ai.*` + `tiers.*` blocks: identical key trees ×3, new keys present
 *   - rectify `chat.gated_note`: reworded to "needs an AI model" (no on-device tier)
 *   - dashboard "Connect an AI model" card: present ×3, no on-device AI option line
 *   - landing "Bring your own AI" body: states the no-AI default ×3
 */
import { describe, expect, it } from 'vitest';

import enSettings from '../../locales/en/settings.json';
import esSettings from '../../locales/es/settings.json';
import ptSettings from '../../locales/pt/settings.json';
import enRectify from '../../locales/en/rectify.json';
import esRectify from '../../locales/es/rectify.json';
import ptRectify from '../../locales/pt/rectify.json';
import enDashboard from '../../locales/en/dashboard.json';
import esDashboard from '../../locales/es/dashboard.json';
import ptDashboard from '../../locales/pt/dashboard.json';
import enLanding from '../../locales/en/landing.json';
import esLanding from '../../locales/es/landing.json';
import ptLanding from '../../locales/pt/landing.json';

type Catalog = Record<string, unknown>;

function leafKeys(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') {
    return [prefix];
  }
  return Object.entries(node as Catalog)
    .filter(([key]) => key !== '_meta')
    .flatMap(([key, value]) => leafKeys(value, prefix ? `${prefix}.${key}` : key))
    .sort();
}

const settingsAll = [enSettings, esSettings, ptSettings] as Catalog[];

describe('AI settings locale parity', () => {
  it('settings ai block: identical key tree in en/es/pt', () => {
    const [en, es, pt] = settingsAll.map((c) => leafKeys(c.ai));
    expect(es).toEqual(en);
    expect(pt).toEqual(en);
    // A couple of the redesign's new keys are present…
    expect(en).toContain('save_and_test');
    expect(en).toContain('connected');
    expect(en).toContain('error_auth');
    // …and none of the deleted keys survive.
    expect(en).not.toContain('intro');
    expect(en).not.toContain('use_openrouter_button');
    expect(en).not.toContain('save_model_settings');
  });

  it('settings tiers block: identical key tree in en/es/pt', () => {
    const [en, es, pt] = settingsAll.map((c) => leafKeys(c.tiers));
    expect(es).toEqual(en);
    expect(pt).toEqual(en);
    expect(en).toContain('none_title');
    expect(en).toContain('cloud_title');
    expect(en).not.toContain('cloud_badge');
  });

  it('rectify gate copy reworded to "needs an AI model", no on-device tier ×3', () => {
    const notes = [enRectify, esRectify, ptRectify].map(
      (c) => ((c as Catalog).chat as Catalog).gated_note as string,
    );
    expect(notes[0]).toMatch(/needs an AI model/);
    expect(notes[1]).toMatch(/necesita un modelo de IA/);
    expect(notes[2]).toMatch(/precisa de um modelo de IA/);
    // The deleted on-device AI tier is no longer named as an option.
    expect(notes[0]).not.toMatch(/on-device AI/i);
    expect(notes[1]).not.toMatch(/IA en el dispositivo/i);
    expect(notes[2]).not.toMatch(/IA no dispositivo/i);
  });

  it('dashboard "connect an AI model" copy drops the on-device AI option ×3', () => {
    // The old `cta.*` card was replaced by the graceful-degradation notice
    // (`narration.*`), which now carries this copy. Same property, new home.
    const bodies = [enDashboard, esDashboard, ptDashboard].map(
      (c) => ((c as Catalog).narration as Catalog).next_no_key as string,
    );
    expect(bodies[0]).toMatch(/connect an AI model/i);
    expect(bodies[1]).toMatch(/conecta un modelo de IA/i);
    expect(bodies[2]).toMatch(/conecte um modelo de IA/i);
    // The "on-device AI option (beta)" sentence is gone; the on-device ENGINE line stays.
    expect(bodies[0]).not.toMatch(/on-device AI option/i);
    expect(
      ((enDashboard as Catalog).narration as Catalog).chart_complete_body as string,
    ).toMatch(/calculated on-device/i);
  });

  it('landing "Bring your own AI" body states the no-AI default ×3', () => {
    const bodies = [enLanding, esLanding, ptLanding].map((c) => {
      const features = (c as Catalog).features as Catalog;
      const items = features.items as Array<{ body: string }>;
      return items[1].body;
    });
    expect(bodies[0]).toMatch(/Default: no AI/);
    expect(bodies[1]).toMatch(/Por defecto: sin IA/);
    expect(bodies[2]).toMatch(/Por padrão: sem IA/);
    // No on-device narration option remains.
    expect(bodies[0]).not.toMatch(/on-device/i);
  });
});
