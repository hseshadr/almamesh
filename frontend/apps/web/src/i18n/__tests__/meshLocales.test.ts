/**
 * Mesh i18n parity — the `mesh` namespace must carry the SAME key tree in
 * en/es/pt (en authoritative), every leaf a non-empty string, and the shared
 * nav entry must exist in all three `common` catalogs.
 *
 * `_meta` is the catalog-level review marker (machine-translated note) and is
 * excluded from parity on purpose.
 */
import { describe, expect, it } from 'vitest';

import enCommon from '../../locales/en/common.json';
import esCommon from '../../locales/es/common.json';
import ptCommon from '../../locales/pt/common.json';
import enMesh from '../../locales/en/mesh.json';
import esMesh from '../../locales/es/mesh.json';
import ptMesh from '../../locales/pt/mesh.json';

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

function emptyLeaves(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') {
    return node.trim().length === 0 ? [prefix] : [];
  }
  if (node === null || typeof node !== 'object') {
    return [prefix];
  }
  return Object.entries(node as Catalog)
    .filter(([key]) => key !== '_meta')
    .flatMap(([key, value]) => emptyLeaves(value, prefix ? `${prefix}.${key}` : key));
}

describe('mesh namespace locale parity', () => {
  it('es carries exactly the English key tree', () => {
    expect(leafKeys(esMesh)).toEqual(leafKeys(enMesh));
  });

  it('pt carries exactly the English key tree', () => {
    expect(leafKeys(ptMesh)).toEqual(leafKeys(enMesh));
  });

  it('every leaf is a non-empty string in all three catalogs', () => {
    expect(emptyLeaves(enMesh)).toEqual([]);
    expect(emptyLeaves(esMesh)).toEqual([]);
    expect(emptyLeaves(ptMesh)).toEqual([]);
  });

  it('the main-nav Mesh entry exists in every common catalog', () => {
    for (const catalog of [enCommon, esCommon, ptCommon]) {
      const nav = (catalog as Catalog).nav as Record<string, unknown>;
      expect(typeof nav.mesh).toBe('string');
      expect((nav.mesh as string).length).toBeGreaterThan(0);
    }
  });
});
