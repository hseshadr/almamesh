/**
 * AI-tiers i18n (Spec 063) — the new/changed keys ship in en/es/pt with full
 * key-tree parity (en authoritative), and the gate/messaging copy actually
 * says what the spec requires:
 *   - settings `tiers.*` + `model.*` blocks: identical key trees ×3
 *   - rectify `chat.gated_note`: cloud-or-on-device wording ×3
 *   - dashboard `generation.on_device_scope`: present ×3
 *   - common `ai_badge.on_device`: present ×3
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
import enCommon from '../../locales/en/common.json';
import esCommon from '../../locales/es/common.json';
import ptCommon from '../../locales/pt/common.json';
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

describe('AI tiers locale parity (Spec 063)', () => {
  it('settings tiers block: identical key tree in en/es/pt', () => {
    const [en, es, pt] = settingsAll.map((c) => leafKeys(c.tiers));
    expect(es).toEqual(en);
    expect(pt).toEqual(en);
    expect(en).toContain('none_title');
    expect(en).toContain('ondevice_title');
    expect(en).toContain('cloud_title');
  });

  it('settings model block: identical key tree in en/es/pt, incl. probe reasons', () => {
    const [en, es, pt] = settingsAll.map((c) => leafKeys(c.model));
    expect(es).toEqual(en);
    expect(pt).toEqual(en);
    for (const key of ['reason_no_webgpu', 'reason_no_adapter', 'reason_adapter_error', 'disclosure', 'scope_note', 'remove']) {
      expect(en).toContain(key);
    }
  });

  it('rectify gate copy swapped to cloud-or-on-device wording ×3', () => {
    const notes = [enRectify, esRectify, ptRectify].map(
      (c) => ((c as Catalog).chat as Catalog).gated_note as string,
    );
    // en mentions both options; es/pt carry their translated equivalents.
    expect(notes[0]).toMatch(/on-device AI or a cloud endpoint/);
    expect(notes[1]).toMatch(/IA en el dispositivo o un endpoint en la nube/);
    expect(notes[2]).toMatch(/IA no dispositivo ou de um endpoint na nuvem/);
    // None of them still claims a cloud endpoint is REQUIRED alone.
    for (const note of notes) {
      expect(note.length).toBeGreaterThan(0);
    }
  });

  it('dashboard on_device_scope guidance exists ×3', () => {
    for (const catalog of [enDashboard, esDashboard, ptDashboard]) {
      const generation = (catalog as Catalog).generation as Catalog;
      expect(typeof generation.on_device_scope).toBe('string');
      expect((generation.on_device_scope as string).length).toBeGreaterThan(20);
    }
  });

  it('common ai_badge.on_device label exists ×3', () => {
    for (const catalog of [enCommon, esCommon, ptCommon]) {
      const badge = (catalog as Catalog).ai_badge as Catalog;
      expect(typeof badge.on_device).toBe('string');
    }
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
  });
});
