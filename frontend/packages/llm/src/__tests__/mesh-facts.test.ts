import { describe, expect, it } from "vitest";

import meshGolden from "../../../../../backend/tests/fixtures/mesh_golden_de421.json";
import { buildMeshFactsBlock, MESH_BLOCK_END, MESH_BLOCK_START } from "../mesh-facts";
import { sanitizeMeshEdgeForLlm, type SanitizedMeshEdge } from "../mesh-sanitize";
import type { MeshEdgeContext, MeshRelationship } from "../mesh-types";

const edges = Object.values(meshGolden as unknown as Record<string, MeshEdgeContext>);

function sanitizedEdgeFor(relationship: MeshRelationship): SanitizedMeshEdge {
  const edge = edges.find((e) => e.relationship === relationship);
  if (!edge) {
    throw new Error(`mesh golden carries no ${relationship} edge`);
  }
  return sanitizeMeshEdgeForLlm(edge);
}

const SPOUSE = sanitizedEdgeFor("spouse");
const FRIEND = sanitizedEdgeFor("friend");
const BUSINESS = sanitizedEdgeFor("business");

// How many contacts per overlay direction the block lists before honestly
// noting the remainder. Mirrored from the implementation contract.
const CONTACT_CAP = 6;

describe("buildMeshFactsBlock — graceful absence", () => {
  it("returns the EXACT empty string when no edge is provided", () => {
    expect(buildMeshFactsBlock(undefined)).toBe("");
    expect(buildMeshFactsBlock(null)).toBe("");
  });
});

describe("buildMeshFactsBlock — ashtakoota (classical convention)", () => {
  const block = buildMeshFactsBlock(SPOUSE);

  it("is wrapped in the mesh delimiters", () => {
    expect(block.startsWith(MESH_BLOCK_START)).toBe(true);
    expect(block.endsWith(MESH_BLOCK_END)).toBe(true);
  });

  it("renders one line per koota with earned/max and the engine basis verbatim", () => {
    for (const koota of SPOUSE.ashtakoota.kootas) {
      expect(block).toContain(`- ${koota.koota}: ${koota.earned}/${koota.maximum} — ${koota.basis}`);
    }
    // Spot-check a real golden line end-to-end.
    expect(block).toContain("- varna: 0/1 — groom Virgo (vaishya) x bride Leo (kshatriya)");
  });

  it('labels the total and band as "classical convention"', () => {
    expect(block).toContain('Total: 21.5/36 — band "average" (classical convention)');
    // The engine's own threshold prose rides along.
    expect(block).toContain(SPOUSE.ashtakoota.band_basis);
  });

  it("renders the bhakoot dosha as present and not cancelled, with its basis", () => {
    expect(block).toContain("Bhakoot dosha: present, not cancelled — Virgo and Leo stand 2/12 from each other");
  });

  it("renders the nadi dosha as not present", () => {
    expect(block).toMatch(/Nadi dosha: not present/);
  });

  it("renders fired cancellations with rule and description", () => {
    // No golden edge carries a CANCELLED bhakoot/nadi dosha, so cover the
    // wording branch with a minimal engine-shaped variant of the real edge.
    const cancelled: SanitizedMeshEdge = {
      ...SPOUSE,
      ashtakoota: {
        ...SPOUSE.ashtakoota,
        bhakoot_dosha: {
          ...SPOUSE.ashtakoota.bhakoot_dosha,
          cancelled: true,
          cancellations: [
            {
              rule: "bhakoot.lords_mutual_friends",
              description: "the two Moon-sign lords are mutual friends",
              source: "standard Melapaka cancellation practice",
            },
          ],
        },
      },
    };
    const rendered = buildMeshFactsBlock(cancelled);
    expect(rendered).toContain("Bhakoot dosha: present, CANCELLED");
    expect(rendered).toContain(
      "cancelled by bhakoot.lords_mutual_friends: the two Moon-sign lords are mutual friends",
    );
  });
});

describe("buildMeshFactsBlock — mangal (Kuja) dosha", () => {
  it("renders both people's verdicts under role labels, never names", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toMatch(/- you: clear/);
    expect(block).toMatch(/- your spouse: afflicted/);
  });

  it("renders each reference verdict including a fired cancellation rule", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    // Side a's Moon reference is in a dosha house but cancelled (golden fact).
    expect(block).toContain("cancelled by mangal.own_sign");
    // Side b's lagna reference carries the net dosha (golden fact).
    expect(block).toMatch(/lagna: Mars house 12, net dosha/);
  });

  it("renders the mutual-cancellation verdict (friend edge: neutralized)", () => {
    const block = buildMeshFactsBlock(FRIEND);
    expect(block).toContain("Mutual cancellation: yes — dosha neutralized between the charts");
    expect(block).toContain("compatible: yes");
  });

  it("maps the engine's chart-a/chart-b basis onto roles", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toContain("chart a = you, chart b = your spouse");
    expect(block).toContain(SPOUSE.mangal_match.basis);
  });
});

describe("buildMeshFactsBlock — overlay (strongest contacts, both directions)", () => {
  it("labels both directions with roles (other's grahas in your chart, and yours in theirs)", () => {
    const block = buildMeshFactsBlock(BUSINESS);
    expect(block).toContain("Your business partner's grahas in your chart");
    expect(block).toContain("Your grahas in your business partner's chart");
  });

  it("lists close conjunctions first, tightest orb first, with the heuristic flag", () => {
    const block = buildMeshFactsBlock(BUSINESS);
    // Real golden close conjunction: their mercury on your natal moon, 0.48 deg.
    expect(block).toContain("mercury close_conjunction your natal moon");
    expect(block).toContain("orb 0.48°");
    expect(block).toContain("modern orb convention");
    // Ordering contract: the FIRST contact line of the direction is the
    // tightest close conjunction (0.48° mercury -> moon beats 1.57° moon -> sun).
    const lines = block.split("\n");
    const headingIdx = lines.findIndex((l) =>
      l.startsWith("Your business partner's grahas in your chart"),
    );
    expect(lines[headingIdx + 1]).toContain("mercury close_conjunction your natal moon");
    expect(lines[headingIdx + 1]).toContain("orb 0.48°");
    const moonSunIdx = lines.findIndex((l) => l.includes("moon close_conjunction your natal sun"));
    expect(moonSunIdx).toBeGreaterThan(headingIdx + 1);
  });

  it("includes planet -> target, kind, and host house on each contact line", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    // Real golden same-sign contact: their sun shares your 2nd house with ketu.
    expect(block).toContain("sun same_sign your natal ketu (in your 2nd house");
  });

  it("caps each direction and states the remainder honestly", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    const remainder = SPOUSE.overlay.b_in_a.contacts.length - CONTACT_CAP;
    expect(remainder).toBeGreaterThan(0);
    expect(block).toContain(`(+${remainder} more engine contacts not listed)`);
  });
});

describe("buildMeshFactsBlock — dasha synchrony (month precision)", () => {
  it("renders the engine window and each segment as month spans with both stacks", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toContain("2025-01 -> 2027-01");
    expect(block).toContain("- 2025-01 -> 2025-04: you in rahu/saturn, your spouse in jupiter/mercury");
  });

  it("marks shared dasha lords on the segments that carry them", () => {
    const block = buildMeshFactsBlock(BUSINESS);
    expect(block).toContain("shared lord(s): saturn");
  });

  it("states both engine-declared dasha-year conventions", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toContain("julian_365_25");
    expect(block).toMatch(/Dasha-year convention/);
  });

  it("never contains a day-precision date anywhere", () => {
    for (const edge of [SPOUSE, FRIEND, BUSINESS]) {
      expect(buildMeshFactsBlock(edge)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe("buildMeshFactsBlock — relationship significators (both charts)", () => {
  it("renders both sides under role labels with the house, sign and lord", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toContain("- You: house 7");
    expect(block).toContain("- Your spouse: house 7");
    expect(block).toContain("Sagittarius, lord jupiter");
    expect(block).toContain("Aquarius, lord saturn");
  });

  it("renders the lord's engine condition verbatim (dignity, retrograde, combust)", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toContain("jupiter in Gemini (house 1), neutral, retrograde");
    expect(block).toContain("saturn in Libra (house 3), exalted, retrograde");
  });

  it("renders the karakas including a combust flag and the karakatva citation", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toContain("venus in Capricorn (house 8), neutral, retrograde, combust");
    expect(block).toContain("kalatra (spouse) karaka");
  });

  it("renders occupants, or none when the karaka house is empty", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toContain("occupants: mercury, saturn");
    expect(block).toMatch(/occupants: none/);
  });
});

describe("buildMeshFactsBlock — role labels and guard", () => {
  it("derives the role phrase from the edge relationship by default", () => {
    expect(buildMeshFactsBlock(FRIEND)).toContain("your friend");
  });

  it("honors an explicit relationship override for the role phrase", () => {
    const block = buildMeshFactsBlock(SPOUSE, "mother");
    expect(block).toContain("your mother");
    expect(block).not.toContain("your spouse");
  });

  it("carries the narrate-only guard and the never-a-verdict framing", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toMatch(/Narrate ONLY what this block states/i);
    expect(block).toMatch(/never verdicts/i);
  });

  it("carries the engine integrity note verbatim", () => {
    const block = buildMeshFactsBlock(SPOUSE);
    expect(block).toContain(SPOUSE.integrity_note);
  });
});
