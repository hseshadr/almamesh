import { describe, expect, it } from "vitest";

import type { MeshEdgeContext } from "@almamesh/browser/types";

import meshGolden from "../../../../../backend/tests/fixtures/mesh_golden_de421.json";
import { toMeshEdgeCtx } from "./mesh";

// ---------------------------------------------------------------------------
// Fixture: the committed backend mesh golden IS the serialized contract
// (Pydantic model_dump(mode="json")), exactly what the Pyodide worker emits.
// ---------------------------------------------------------------------------

const SPOUSE_KEY = "1990-01-15T12:00:00+00:00|1985-07-23T04:30:00+00:00|spouse";
const raw = (meshGolden as Record<string, MeshEdgeContext>)[SPOUSE_KEY];

describe("toMeshEdgeCtx", () => {
  it("returns undefined when the engine payload omits the edge (older bundles)", () => {
    expect(toMeshEdgeCtx(undefined)).toBeUndefined();
    expect(toMeshEdgeCtx(null)).toBeUndefined();
  });

  it("echoes the relation head fields and the integrity note verbatim", () => {
    const ctx = toMeshEdgeCtx(raw);

    expect(ctx).toBeDefined();
    expect(ctx?.relationship).toBe("spouse");
    expect(ctx?.role_a).toBe("bride");
    expect(ctx?.role_b).toBe("groom");
    expect(ctx?.integrity_note).toBe(raw.integrity_note);
    expect(ctx?.integrity_note).toContain("read-only");
  });

  it("keeps every ashtakoota number verbatim and lowercases the Moon signs", () => {
    const ctx = toMeshEdgeCtx(raw);
    const ak = ctx?.ashtakoota;

    expect(ak?.total).toBe(raw.ashtakoota.total); // 21.5, hand-derived in backend tests
    expect(ak?.total).toBe(21.5);
    expect(ak?.maximum).toBe(36.0);
    expect(ak?.band).toBe(raw.ashtakoota.band);
    expect(ak?.kootas).toHaveLength(8);
    ak?.kootas.forEach((koota, i) => {
      expect(koota.earned).toBe(raw.ashtakoota.kootas[i].earned);
      expect(koota.maximum).toBe(raw.ashtakoota.kootas[i].maximum);
      expect(koota.basis).toBe(raw.ashtakoota.kootas[i].basis);
      expect(koota.source).toBe(raw.ashtakoota.kootas[i].source);
    });
    // Engine emits Title-Case signs ("Leo"); the UI contract is lowercase.
    expect(ak?.bride_moon.sign).toBe(raw.ashtakoota.bride_moon.sign.toLowerCase());
    expect(ak?.groom_moon.sign).toBe(raw.ashtakoota.groom_moon.sign.toLowerCase());
    expect(ak?.bride_moon.sign_degrees).toBe(raw.ashtakoota.bride_moon.sign_degrees);
    expect(ak?.bhakoot_dosha.present).toBe(raw.ashtakoota.bhakoot_dosha.present);
    expect(ak?.nadi_dosha.cancellations).toEqual(raw.ashtakoota.nadi_dosha.cancellations);
  });

  it("maps the mutual mangal screen with lowercase Mars signs and verbatim verdicts", () => {
    const ctx = toMeshEdgeCtx(raw);
    const mm = ctx?.mangal_match;

    expect(mm?.a.has_dosha).toBe(raw.mangal_match.a.has_dosha);
    expect(mm?.b.has_dosha).toBe(raw.mangal_match.b.has_dosha);
    expect(mm?.compatible).toBe(raw.mangal_match.compatible);
    expect(mm?.mutually_cancelled).toBe(raw.mangal_match.mutually_cancelled);
    expect(mm?.a.references).toHaveLength(3);
    mm?.a.references.forEach((ref, i) => {
      expect(ref.reference).toBe(raw.mangal_match.a.references[i].reference);
      expect(ref.mars_sign).toBe(raw.mangal_match.a.references[i].mars_sign.toLowerCase());
      expect(ref.mars_house).toBe(raw.mangal_match.a.references[i].mars_house);
      expect(ref.net_dosha).toBe(raw.mangal_match.a.references[i].net_dosha);
    });
  });

  it("maps both overlay directions: lowercase signs, verbatim houses/orbs/kinds", () => {
    const ctx = toMeshEdgeCtx(raw);

    for (const dir of ["b_in_a", "a_in_b"] as const) {
      const overlay = ctx?.overlay[dir];
      const rawOverlay = raw.overlay[dir];
      expect(overlay?.host_lagna_sign).toBe(rawOverlay.host_lagna_sign.toLowerCase());
      expect(overlay?.conjunction_orb_degrees).toBe(rawOverlay.conjunction_orb_degrees);
      expect(overlay?.placements).toHaveLength(9);
      overlay?.placements.forEach((p, i) => {
        expect(p.planet).toBe(rawOverlay.placements[i].planet); // already lowercase
        expect(p.sign).toBe(rawOverlay.placements[i].sign.toLowerCase());
        expect(p.host_house).toBe(rawOverlay.placements[i].host_house);
      });
      overlay?.contacts.forEach((c, i) => {
        expect(c.kind).toBe(rawOverlay.contacts[i].kind);
        expect(c.target).toBe(rawOverlay.contacts[i].target);
        expect(c.orb_degrees).toBe(rawOverlay.contacts[i].orb_degrees); // null preserved
        expect(c.heuristic).toBe(rawOverlay.contacts[i].heuristic);
      });
    }
  });

  it("maps the dasha synchrony verbatim (dates, lords, conventions)", () => {
    const ctx = toMeshEdgeCtx(raw);
    const sync = ctx?.synchrony;

    expect(sync?.window_start).toBe(raw.synchrony.window_start);
    expect(sync?.window_end).toBe(raw.synchrony.window_end);
    expect(sync?.convention_a).toBe(raw.synchrony.convention_a);
    expect(sync?.convention_b).toBe(raw.synchrony.convention_b);
    expect(sync?.segments).toHaveLength(raw.synchrony.segments.length);
    sync?.segments.forEach((seg, i) => {
      const rawSeg = raw.synchrony.segments[i];
      expect(seg.start).toBe(rawSeg.start);
      expect(seg.end).toBe(rawSeg.end);
      expect(seg.a_maha).toBe(rawSeg.a_maha);
      expect(seg.b_antar).toBe(rawSeg.b_antar);
      expect(seg.shared_lords).toEqual(rawSeg.shared_lords);
      expect(seg.simultaneous_boundary).toBe(rawSeg.simultaneous_boundary);
    });
  });

  it("maps both charts' relation significators with lowercase signs", () => {
    const ctx = toMeshEdgeCtx(raw);

    for (const side of ["significators_a", "significators_b"] as const) {
      const sig = ctx?.[side];
      const rawSig = raw[side];
      expect(sig?.relationship).toBe("spouse");
      expect(sig?.karaka_house).toBe(rawSig.karaka_house);
      expect(sig?.house_sign).toBe(rawSig.house_sign.toLowerCase());
      expect(sig?.house_lord).toBe(rawSig.house_lord);
      expect(sig?.lord_condition.sign).toBe(rawSig.lord_condition.sign.toLowerCase());
      expect(sig?.lord_condition.dignity).toBe(rawSig.lord_condition.dignity);
      expect(sig?.lord_condition.is_retrograde).toBe(rawSig.lord_condition.is_retrograde);
      expect(sig?.occupants).toEqual(rawSig.occupants);
      expect(sig?.karakas.length).toBe(rawSig.karakas.length);
      sig?.karakas.forEach((k, i) => {
        expect(k.condition.planet).toBe(rawSig.karakas[i].condition.planet);
        expect(k.condition.sign).toBe(rawSig.karakas[i].condition.sign.toLowerCase());
        expect(k.source).toBe(rawSig.karakas[i].source);
      });
    }
    // The anchor (a) spouse house is the 7th — hand-derived in backend tests.
    expect(ctx?.significators_a.karaka_house).toBe(7);
  });
});
