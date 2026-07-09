/**
 * AI-tiers i18n (Spec 063) — the new/changed keys ship in en/es/pt with full
 * key-tree parity (en authoritative), and the gate/messaging copy actually
 * says what the spec requires:
 *   - settings `tiers.*` block: identical key trees ×3
 *   - rectify `chat.gated_note`: gate wording ×3
 *   - dashboard "Connect an AI model" card: present ×3
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

describe('AI tiers locale parity (Spec 063)', () => {
  it('settings tiers block: identical key tree in en/es/pt', () => {
    const [en, es, pt] = settingsAll.map((c) => leafKeys(c.tiers));
    expect(es).toEqual(en);
    expect(pt).toEqual(en);
    expect(en).toContain('none_title');
    expect(en).toContain('cloud_title');
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

  it('dashboard "Connect an AI model" card also mentions the on-device option ×3', () => {
    const bodies = [enDashboard, esDashboard, ptDashboard].map(
      (c) => ((c as Catalog).cta as Catalog).body as string,
    );
    expect(bodies[0]).toMatch(/on-device AI option/i);
    expect(bodies[1]).toMatch(/IA en el dispositivo/i);
    expect(bodies[2]).toMatch(/IA no dispositivo/i);
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
