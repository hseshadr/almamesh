import { describe, expect, it } from "vitest";

import meshGolden from "../../../../../backend/tests/fixtures/mesh_golden_de421.json";
import type { MeshEdgeContext, MeshRelationship } from "../mesh-types";
import { meshRoleLabels, sanitizeMeshEdgeForLlm } from "../mesh-sanitize";

// The committed mesh golden: three REAL engine edges (spouse / friend /
// business) keyed by "birthA|birthB|relationship". The KEYS carry both birth
// instants — exactly the PII that must never ride — so tests select edges by
// their `relationship` field, never by key.
const edges = Object.values(meshGolden as unknown as Record<string, MeshEdgeContext>);

function edgeFor(relationship: MeshRelationship): MeshEdgeContext {
  const edge = edges.find((e) => e.relationship === relationship);
  if (!edge) {
    throw new Error(`mesh golden carries no ${relationship} edge`);
  }
  return edge;
}

const SPOUSE = edgeFor("spouse");
const FRIEND = edgeFor("friend");
const BUSINESS = edgeFor("business");

// Recursively collect every string value in an object tree (for leak scanning).
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

function allStrings(value: unknown): string[] {
  const out: string[] = [];
  collectStrings(value, out);
  return out;
}

// ISO-8601 absolute timestamp — the birth-identifying leak vector.
const ABSOLUTE_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// Any day-or-finer date. Month precision ("YYYY-MM") is the allowed granularity
// — the SAME outbound contract as the natal sanitizer's dasha tree.
const DAY_PRECISION = /\d{4}-\d{2}-\d{2}/;
const MONTH_ONLY = /^\d{4}-\d{2}$/;

describe("sanitizeMeshEdgeForLlm — pair privacy boundary", () => {
  it("never emits an absolute ISO timestamp anywhere, for any golden edge", () => {
    for (const edge of [SPOUSE, FRIEND, BUSINESS]) {
      const sanitized = sanitizeMeshEdgeForLlm(edge);
      expect(allStrings(sanitized).filter((s) => ABSOLUTE_ISO.test(s))).toEqual([]);
    }
  });

  it("never emits any day-precision date anywhere, for any golden edge", () => {
    for (const edge of [SPOUSE, FRIEND, BUSINESS]) {
      const sanitized = sanitizeMeshEdgeForLlm(edge);
      expect(allStrings(sanitized).filter((s) => DAY_PRECISION.test(s))).toEqual([]);
    }
  });

  it("reduces the synchrony window and every segment to month precision", () => {
    const sanitized = sanitizeMeshEdgeForLlm(SPOUSE);
    const sync = sanitized.synchrony;
    expect(sync.window_start_month).toMatch(MONTH_ONLY);
    expect(sync.window_end_month).toMatch(MONTH_ONLY);
    expect(sync.segments.length).toBe(SPOUSE.synchrony.segments.length);
    for (const segment of sync.segments) {
      expect(segment.start_month).toMatch(MONTH_ONLY);
      expect(segment.end_month).toMatch(MONTH_ONLY);
      expect(segment).not.toHaveProperty("start");
      expect(segment).not.toHaveProperty("end");
    }
    // The window months come from the engine's own dates, verbatim-truncated.
    expect(sync.window_start_month).toBe(SPOUSE.synchrony.window_start.slice(0, 7));
    expect(sync.window_end_month).toBe(SPOUSE.synchrony.window_end.slice(0, 7));
  });

  it("preserves each segment's dasha lords, shared lords, and boundary flag", () => {
    const sanitized = sanitizeMeshEdgeForLlm(BUSINESS);
    const raw = BUSINESS.synchrony.segments;
    sanitized.synchrony.segments.forEach((segment, i) => {
      expect(segment.a_maha).toBe(raw[i].a_maha);
      expect(segment.a_antar).toBe(raw[i].a_antar);
      expect(segment.b_maha).toBe(raw[i].b_maha);
      expect(segment.b_antar).toBe(raw[i].b_antar);
      expect(segment.shared_lords).toEqual(raw[i].shared_lords);
      expect(segment.simultaneous_boundary).toBe(raw[i].simultaneous_boundary);
    });
    // The business golden carries a real shared-lord segment (saturn).
    const shared = sanitized.synchrony.segments.filter((s) => s.shared_lords.length > 0);
    expect(shared.length).toBeGreaterThan(0);
    expect(shared[0].shared_lords).toContain("saturn");
  });

  it("drops layered-on identifier and name fields for BOTH people (allowlist)", () => {
    // Simulate an over-broad caller payload carrying names, ids, and raw birth
    // data for both people; the allowlist rebuild must drop every one of them.
    const withPii = {
      ...SPOUSE,
      subject_name: "Asha Rao",
      other_name: "Vikram Rao",
      chart_id_a: "chart-abc-123",
      chart_id_b: "chart-def-456",
      birth_datetime_a: "1990-01-15T12:00:00+00:00",
      birth_datetime_b: "1985-07-23T04:30:00+00:00",
      birth_place_a: "Mumbai, India",
      birth_place_b: "Pune, India",
      generated_at: "2026-06-11T00:00:00Z",
    } as unknown as MeshEdgeContext;

    const sanitized = sanitizeMeshEdgeForLlm(withPii);
    const serialized = JSON.stringify(sanitized);
    for (const leak of [
      "Asha",
      "Vikram",
      "chart-abc-123",
      "chart-def-456",
      "1990-01-15",
      "1985-07-23",
      "Mumbai",
      "Pune",
      "generated_at",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("rebuilds nested shapes by allowlist too (junk inside a koota is dropped)", () => {
    const poisoned = {
      ...SPOUSE,
      ashtakoota: {
        ...SPOUSE.ashtakoota,
        kootas: SPOUSE.ashtakoota.kootas.map((k) => ({
          ...k,
          computed_for: "Asha Rao b. 1990-01-15",
        })),
      },
    } as unknown as MeshEdgeContext;

    const serialized = JSON.stringify(sanitizeMeshEdgeForLlm(poisoned));
    expect(serialized).not.toContain("computed_for");
    expect(serialized).not.toContain("Asha");
  });

  it("keeps all 8 kootas verbatim: earned, maximum, basis, source", () => {
    const sanitized = sanitizeMeshEdgeForLlm(SPOUSE);
    expect(sanitized.ashtakoota.kootas.length).toBe(8);
    sanitized.ashtakoota.kootas.forEach((koota, i) => {
      const raw = SPOUSE.ashtakoota.kootas[i];
      expect(koota.koota).toBe(raw.koota);
      expect(koota.earned).toBe(raw.earned);
      expect(koota.maximum).toBe(raw.maximum);
      expect(koota.basis).toBe(raw.basis);
      expect(koota.source).toBe(raw.source);
    });
    expect(sanitized.ashtakoota.total).toBe(SPOUSE.ashtakoota.total);
    expect(sanitized.ashtakoota.band).toBe(SPOUSE.ashtakoota.band);
    expect(sanitized.ashtakoota.band_basis).toBe(SPOUSE.ashtakoota.band_basis);
  });

  it("keeps the dosha flags including their cancellation rules", () => {
    const sanitized = sanitizeMeshEdgeForLlm(SPOUSE);
    expect(sanitized.ashtakoota.bhakoot_dosha.present).toBe(true);
    expect(sanitized.ashtakoota.bhakoot_dosha.cancelled).toBe(false);
    expect(sanitized.ashtakoota.nadi_dosha.present).toBe(false);

    // The spouse golden's side-a Moon reference carries a REAL fired
    // cancellation (mangal.own_sign) — it must survive verbatim.
    const moonRef = sanitized.mangal_match.a.references.find((r) => r.reference === "moon");
    expect(moonRef?.cancellations.map((c) => c.rule)).toContain("mangal.own_sign");
  });

  it("keeps the mutual mangal verdicts (friend edge: mutually cancelled)", () => {
    const sanitized = sanitizeMeshEdgeForLlm(FRIEND);
    expect(sanitized.mangal_match.a.has_dosha).toBe(true);
    expect(sanitized.mangal_match.b.has_dosha).toBe(true);
    expect(sanitized.mangal_match.mutually_cancelled).toBe(true);
    expect(sanitized.mangal_match.compatible).toBe(true);
    expect(sanitized.mangal_match.basis).toBe(FRIEND.mangal_match.basis);
  });

  it("keeps both overlay directions: 9 placements and every typed contact", () => {
    const sanitized = sanitizeMeshEdgeForLlm(BUSINESS);
    for (const direction of ["b_in_a", "a_in_b"] as const) {
      const overlay = sanitized.overlay[direction];
      const raw = BUSINESS.overlay[direction];
      expect(overlay.placements.length).toBe(9);
      expect(overlay.contacts.length).toBe(raw.contacts.length);
      overlay.contacts.forEach((contact, i) => {
        expect(contact.planet).toBe(raw.contacts[i].planet);
        expect(contact.target).toBe(raw.contacts[i].target);
        expect(contact.kind).toBe(raw.contacts[i].kind);
        expect(contact.host_house).toBe(raw.contacts[i].host_house);
        expect(contact.orb_degrees).toBe(raw.contacts[i].orb_degrees);
        expect(contact.heuristic).toBe(raw.contacts[i].heuristic);
      });
    }
  });

  it("keeps both significator readings (house, lord condition, karakas)", () => {
    const sanitized = sanitizeMeshEdgeForLlm(SPOUSE);
    expect(sanitized.significators_a.karaka_house).toBe(7);
    expect(sanitized.significators_b.karaka_house).toBe(7);
    expect(sanitized.significators_a.house_lord).toBe(SPOUSE.significators_a.house_lord);
    expect(sanitized.significators_a.lord_condition).toEqual(
      SPOUSE.significators_a.lord_condition,
    );
    expect(sanitized.significators_a.occupants).toEqual(SPOUSE.significators_a.occupants);
    expect(sanitized.significators_b.karakas.length).toBe(
      SPOUSE.significators_b.karakas.length,
    );
  });

  it("keeps the engine integrity note verbatim", () => {
    const sanitized = sanitizeMeshEdgeForLlm(SPOUSE);
    expect(sanitized.integrity_note).toBe(SPOUSE.integrity_note);
  });

  it("is pure — it does not mutate the input edge", () => {
    const before = JSON.stringify(SPOUSE);
    sanitizeMeshEdgeForLlm(SPOUSE);
    expect(JSON.stringify(SPOUSE)).toBe(before);
  });
});

describe("meshRoleLabels — names are replaced by roles", () => {
  it('always calls the subject "you"', () => {
    for (const relationship of [
      "spouse",
      "partner",
      "mother",
      "father",
      "child",
      "sibling",
      "friend",
      "business",
    ] as const) {
      expect(meshRoleLabels(relationship).subject).toBe("you");
    }
  });

  it("maps every relationship to the other person's role phrase", () => {
    expect(meshRoleLabels("spouse").other).toBe("your spouse");
    expect(meshRoleLabels("partner").other).toBe("your partner");
    expect(meshRoleLabels("mother").other).toBe("your mother");
    expect(meshRoleLabels("father").other).toBe("your father");
    expect(meshRoleLabels("child").other).toBe("your child");
    expect(meshRoleLabels("sibling").other).toBe("your sibling");
    expect(meshRoleLabels("friend").other).toBe("your friend");
    expect(meshRoleLabels("business").other).toBe("your business partner");
  });
});
