import { describe, it, expect } from 'vitest';
import en from './en/landing.json';
import es from './es/landing.json';
import pt from './pt/landing.json';
import enMesh from './en/mesh.json';
import esMesh from './es/mesh.json';
import ptMesh from './pt/mesh.json';
import enLegal from './en/legal.json';
import esLegal from './es/legal.json';
import ptLegal from './pt/legal.json';

/**
 * Privacy-honesty invariant: the landing hero + footer must NOT claim an
 * unqualified absolute like "Nothing leaves your browser" / "your data never
 * leaves your browser". Two features reach the network on the user's behalf:
 * the opt-in AI chat sends the user's typed questions to the configured
 * endpoint, and birthplace search sends the typed CITY NAME to a maps geocoder
 * (Open-Meteo). So we may NOT claim "birth data" as a whole stays local — the
 * birthplace name is part of it. The only zero-egress guarantee we state is
 * scoped precisely to the BIRTH DATE, TIME, AND CHART (the chart engine makes no
 * network calls; the date/time and the computed chart never leave the device,
 * and the chart is PII-redacted before any AI call). The scoped phrasing is used
 * consistently in the hero, footer, and `why.rows` across all three locales.
 */
type LocaleCopy = {
  hero: { subhead: string };
  footer: { tagline: string };
};

const LOCALES: Record<string, { copy: LocaleCopy; scoped: string; bannedAbsolutes: string[] }> = {
  en: {
    copy: en as LocaleCopy,
    scoped: 'your birth date, time, and chart never leave your browser',
    bannedAbsolutes: [
      'nothing leaves your browser',
      'your data never leaves your browser',
      'your birth data never leaves your browser',
    ],
  },
  es: {
    copy: es as LocaleCopy,
    scoped: 'tu fecha, hora y carta de nacimiento nunca salen de tu navegador',
    bannedAbsolutes: [
      'nada sale de tu navegador',
      'tus datos nunca salen de tu navegador',
      'tus datos de nacimiento nunca salen de tu navegador',
    ],
  },
  pt: {
    copy: pt as LocaleCopy,
    scoped: 'sua data, hora e mapa de nascimento nunca saem do seu navegador',
    bannedAbsolutes: [
      'nada sai do seu navegador',
      'seus dados nunca saem do seu navegador',
      'seus dados de nascimento nunca saem do seu navegador',
    ],
  },
};

describe('landing privacy copy is scoped to birth data (anti-overclaim)', () => {
  for (const [lang, { copy, scoped, bannedAbsolutes }] of Object.entries(LOCALES)) {
    const subhead = copy.hero.subhead.toLowerCase();
    const tagline = copy.footer.tagline.toLowerCase();

    it(`[${lang}] hero.subhead uses the scoped "birth data" phrasing`, () => {
      expect(subhead).toContain(scoped);
    });

    it(`[${lang}] footer.tagline uses the scoped "birth data" phrasing`, () => {
      expect(tagline).toContain(scoped);
    });

    it(`[${lang}] hero.subhead + footer.tagline contain no unqualified absolute`, () => {
      for (const banned of bannedAbsolutes) {
        expect(subhead).not.toContain(banned);
        expect(tagline).not.toContain(banned);
      }
    });
  }
});

/**
 * The same anti-overclaim invariant on the two ENGINE-SURFACE strings that
 * carried an unqualified absolute:
 *  - mesh `page.computed_note` — the Mesh has reachable AI narration
 *    (`streamMeshReading`) that sends role-anonymized, PII-redacted facts, so a
 *    blanket "nothing leaves it" was an overclaim. Scoped to birth data (the
 *    pair sanitizer strips names + PII before any AI call).
 *  - legal `privacy.s5_p1` — the "Your Rights" premise. The optional AI prompt
 *    egress is disclosed elsewhere (s2/s3), but this sentence itself was an
 *    unqualified "your data never leaves your device"; scoped for legal precision.
 * NOTE: predictive `gate.body` is deliberately NOT covered — its "Nothing leaves
 * this browser" describes the engine-only timing-layer compute (no AI on that
 * path), which is genuinely zero-egress and therefore accurate.
 */
type MeshCopy = { page: { computed_note: string } };
type LegalCopy = { privacy: { s5_p1: string } };

const ENGINE_SURFACES: Record<
  string,
  {
    meshNote: string;
    legalRights: string;
    scoped: string;
    bannedMeshAbsolute: string;
    bannedLegalAbsolute: string;
  }
> = {
  en: {
    meshNote: (enMesh as MeshCopy).page.computed_note,
    legalRights: (enLegal as LegalCopy).privacy.s5_p1,
    scoped: 'birth date, time, and chart',
    bannedMeshAbsolute: 'nothing leaves it',
    bannedLegalAbsolute: 'your data never leaves your device',
  },
  es: {
    meshNote: (esMesh as MeshCopy).page.computed_note,
    legalRights: (esLegal as LegalCopy).privacy.s5_p1,
    scoped: 'fecha, hora y carta',
    bannedMeshAbsolute: 'nada sale de él',
    bannedLegalAbsolute: 'tus datos nunca salen de tu dispositivo',
  },
  pt: {
    meshNote: (ptMesh as MeshCopy).page.computed_note,
    legalRights: (ptLegal as LegalCopy).privacy.s5_p1,
    scoped: 'data, hora e mapa',
    bannedMeshAbsolute: 'nada sai dele',
    bannedLegalAbsolute: 'seus dados nunca saem do seu dispositivo',
  },
};

describe('engine-surface privacy copy is scoped to birth data (anti-overclaim)', () => {
  for (const [lang, surface] of Object.entries(ENGINE_SURFACES)) {
    const meshNote = surface.meshNote.toLowerCase();
    const legalRights = surface.legalRights.toLowerCase();

    it(`[${lang}] mesh.page.computed_note uses the scoped "birth data" phrasing`, () => {
      expect(meshNote).toContain(surface.scoped);
      expect(meshNote).not.toContain(surface.bannedMeshAbsolute);
    });

    it(`[${lang}] legal.privacy.s5_p1 uses the scoped "birth data" phrasing`, () => {
      expect(legalRights).toContain(surface.scoped);
      expect(legalRights).not.toContain(surface.bannedLegalAbsolute);
    });
  }
});

/**
 * Data-portability promise (the flip side of no-centralization): because there
 * is NO server copy of your data, the "How it works" section states that YOU can
 * export everything to a single file and restore it in another browser/device
 * yourself — reinforcing the no-server promise rather than contradicting it (it
 * mirrors the shipped Settings → Data → Backup & Restore feature). Each locale's
 * `how.portability` must name the data export AND the other-device restore, so
 * the promise can't silently regress to a vague "your data is safe".
 */
type HowPortabilityCopy = { how: { portability: string } };

const PORTABILITY: Record<string, { note: string; mustMention: string[] }> = {
  en: { note: (en as HowPortabilityCopy).how.portability, mustMention: ['export', 'device'] },
  es: { note: (es as HowPortabilityCopy).how.portability, mustMention: ['export', 'dispositivo'] },
  pt: { note: (pt as HowPortabilityCopy).how.portability, mustMention: ['export', 'dispositivo'] },
};

describe('landing how.portability states the export/restore promise', () => {
  for (const [lang, { note, mustMention }] of Object.entries(PORTABILITY)) {
    it(`[${lang}] names data export + another device`, () => {
      expect(typeof note).toBe('string');
      const lower = (note ?? '').toLowerCase();
      for (const term of mustMention) expect(lower).toContain(term);
    });
  }
});
