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
 * leaves your browser". The opt-in AI chat DOES send the user's typed questions
 * to the configured endpoint, so the only zero-egress guarantee we may state is
 * scoped to BIRTH DATA (the chart engine makes no network calls, and birth data
 * is PII-redacted before any AI call). The scoped phrasing reuses the exact
 * wording already shipped in `why.rows` ("Your birth data never leaves your
 * browser") so the page is internally consistent across all three locales.
 */
type LocaleCopy = {
  hero: { subhead: string };
  footer: { tagline: string };
};

const LOCALES: Record<string, { copy: LocaleCopy; scoped: string; bannedAbsolutes: string[] }> = {
  en: {
    copy: en as LocaleCopy,
    scoped: 'your birth data never leaves your browser',
    bannedAbsolutes: ['nothing leaves your browser', 'your data never leaves your browser'],
  },
  es: {
    copy: es as LocaleCopy,
    scoped: 'tus datos de nacimiento nunca salen de tu navegador',
    bannedAbsolutes: ['nada sale de tu navegador', 'tus datos nunca salen de tu navegador'],
  },
  pt: {
    copy: pt as LocaleCopy,
    scoped: 'seus dados de nascimento nunca saem do seu navegador',
    bannedAbsolutes: ['nada sai do seu navegador', 'seus dados nunca saem do seu navegador'],
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
    scoped: 'birth data never leaves',
    bannedMeshAbsolute: 'nothing leaves it',
    bannedLegalAbsolute: 'your data never leaves your device',
  },
  es: {
    meshNote: (esMesh as MeshCopy).page.computed_note,
    legalRights: (esLegal as LegalCopy).privacy.s5_p1,
    scoped: 'datos de nacimiento nunca salen',
    bannedMeshAbsolute: 'nada sale de él',
    bannedLegalAbsolute: 'tus datos nunca salen de tu dispositivo',
  },
  pt: {
    meshNote: (ptMesh as MeshCopy).page.computed_note,
    legalRights: (ptLegal as LegalCopy).privacy.s5_p1,
    scoped: 'dados de nascimento nunca saem',
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
