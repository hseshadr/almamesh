import { describe, expect, it, vi } from "vitest";

import meshGolden from "../../../../../backend/tests/fixtures/mesh_golden_de421.json";
import { PrivacyViolationError, type ProviderConfig } from "../config";
import {
  streamMeshReading,
  type MeshReadingEvent,
  type MeshReadingSectionKey,
} from "../mesh-reading";
import type { MeshEdgeContext, MeshRelationship } from "../mesh-types";

const edges = Object.values(meshGolden as unknown as Record<string, MeshEdgeContext>);

function edgeFor(relationship: MeshRelationship): MeshEdgeContext {
  const edge = edges.find((e) => e.relationship === relationship);
  if (!edge) {
    throw new Error(`mesh golden carries no ${relationship} edge`);
  }
  return edge;
}

const SPOUSE = edgeFor("spouse");

const LOCAL_CFG: ProviderConfig = {
  engine: "openai-http",
  model: "llama3.1",
  privacyMode: "local_only",
  baseUrl: "http://localhost:11434/v1",
};

// Canned JSON per section, keyed by the "SECTION:<key>" marker in the prompt.
const SECTION_JSON: Record<MeshReadingSectionKey, unknown> = {
  connection: {
    title: "Where Your Charts Meet",
    layman: "There is a steady, friendly current between you two.",
    technical: "Graha Maitri 4/5; their moon falls in your 4th house.",
  },
  timing_together: {
    title: "Shared Seasons",
    layman: "The coming stretch carries one shared emphasis.",
    technical: "2026-03 -> 2027-01: you in rahu/mercury while they run jupiter/venus.",
  },
  care: {
    title: "Tending the Friction",
    layman: "One pattern asks for patience and plain words.",
    technical: "Bhakoot 0/7 (2/12 placement), present and not cancelled — tend communication.",
  },
};

const ALL_SECTIONS: MeshReadingSectionKey[] = ["connection", "timing_together", "care"];

function markerFor(body: string): MeshReadingSectionKey {
  for (const key of ALL_SECTIONS) {
    if (body.includes(`SECTION:${key}`)) {
      return key;
    }
  }
  throw new Error(`no section marker in request body: ${body.slice(0, 200)}`);
}

function jsonResponse(content: string, init: ResponseInit = { status: 200 }): Response {
  const body = JSON.stringify({ choices: [{ message: { content } }] });
  return new Response(body, { headers: { "Content-Type": "application/json" }, ...init });
}

interface StubState {
  readonly bodies: string[];
}

function makeStubFetch(
  state: StubState,
  fail: ReadonlySet<MeshReadingSectionKey> = new Set(),
): typeof fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = init.body as string;
    state.bodies.push(body);
    const section = markerFor(body);
    if (fail.has(section)) {
      return jsonResponse("", { status: 500, statusText: "Server Error" });
    }
    return jsonResponse(JSON.stringify(SECTION_JSON[section]));
  }) as unknown as typeof fetch;
}

async function collect(gen: AsyncGenerator<MeshReadingEvent>): Promise<MeshReadingEvent[]> {
  const out: MeshReadingEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe("streamMeshReading — happy path", () => {
  it("emits section_start + section_complete for all 3 sections, then complete", async () => {
    const state: StubState = { bodies: [] };
    const events = await collect(
      streamMeshReading({ edge: SPOUSE, config: LOCAL_CFG, fetchImpl: makeStubFetch(state) }),
    );

    for (const key of ALL_SECTIONS) {
      expect(events).toContainEqual({ type: "section_start", section: key });
      expect(events).toContainEqual({ type: "section_complete", section: key });
    }
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
    const complete = events.filter((e) => e.type === "complete");
    expect(complete).toHaveLength(1);
  });

  it("merges the 3 sections into one MeshReading (TitledPersona per section)", async () => {
    const state: StubState = { bodies: [] };
    const events = await collect(
      streamMeshReading({ edge: SPOUSE, config: LOCAL_CFG, fetchImpl: makeStubFetch(state) }),
    );
    const complete = events.find((e) => e.type === "complete");
    if (complete?.type !== "complete") {
      throw new Error("no complete event");
    }
    expect(complete.reading.connection.title).toBe("Where Your Charts Meet");
    expect(complete.reading.timing_together.technical).toContain("2026-03 -> 2027-01");
    expect(complete.reading.care.layman).toContain("patience");
  });
});

describe("streamMeshReading — the prompts on the wire", () => {
  async function capturedBodies(language?: "es"): Promise<string[]> {
    const state: StubState = { bodies: [] };
    await collect(
      streamMeshReading({
        edge: SPOUSE,
        config: LOCAL_CFG,
        fetchImpl: makeStubFetch(state),
        ...(language ? { language } : {}),
      }),
    );
    return state.bodies;
  }

  it("embeds the delimited mesh facts block with the engine's own koota lines", async () => {
    for (const body of await capturedBodies()) {
      expect(body).toContain("ENGINE RELATIONSHIP CONTEXT");
      expect(body).toContain("varna: 0/1");
      expect(body).toContain("classical convention");
    }
  });

  it("carries the anti-scam relationship fence and the output discipline", async () => {
    for (const body of await capturedBodies()) {
      expect(body).toContain("ANTI-SCAM RELATIONSHIP FENCE");
      expect(body).toMatch(/NEVER advise marrying, leaving/);
      expect(body).toContain("OUTPUT DISCIPLINE (ABSOLUTE)");
      expect(body).toContain("DERIVED-FACT FENCE (ABSOLUTE)");
    }
  });

  it("pins roles-not-names language for both people", async () => {
    for (const body of await capturedBodies()) {
      expect(body).toMatch(/relationship role/);
      expect(body).toContain("your spouse");
    }
  });

  it("never lets a day-precision or ISO date cross the wire", async () => {
    for (const body of await capturedBodies()) {
      expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("threads the language instruction like the existing prompts", async () => {
    for (const body of await capturedBodies("es")) {
      expect(body).toContain("Write your entire response in Spanish");
    }
  });

  it("honors a relationship override for the role vocabulary", async () => {
    const state: StubState = { bodies: [] };
    await collect(
      streamMeshReading({
        edge: SPOUSE,
        config: LOCAL_CFG,
        relationship: "mother",
        fetchImpl: makeStubFetch(state),
      }),
    );
    for (const body of state.bodies) {
      expect(body).toContain("your mother");
    }
  });
});

describe("streamMeshReading — degradation and gates", () => {
  it("degrades one failed section to empty and still completes", async () => {
    const state: StubState = { bodies: [] };
    const events = await collect(
      streamMeshReading({
        edge: SPOUSE,
        config: LOCAL_CFG,
        fetchImpl: makeStubFetch(state, new Set(["timing_together"])),
      }),
    );
    const errors = events.filter((e) => e.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ section: "timing_together" });
    const complete = events.find((e) => e.type === "complete");
    if (complete?.type !== "complete") {
      throw new Error("no complete event");
    }
    expect(complete.reading.timing_together).toEqual({ title: "", layman: "", technical: "" });
    expect(complete.reading.connection.title).toBe("Where Your Charts Meet");
  });

  it("throws loudly when ALL sections fail (never a silent empty reading)", async () => {
    const state: StubState = { bodies: [] };
    await expect(
      collect(
        streamMeshReading({
          edge: SPOUSE,
          config: LOCAL_CFG,
          fetchImpl: makeStubFetch(state, new Set(ALL_SECTIONS)),
        }),
      ),
    ).rejects.toThrow(/all 3 sections failed/);
  });

  it("fails closed on a privacy mismatch BEFORE any network call", async () => {
    const cloudUnderLocalOnly: ProviderConfig = {
      ...LOCAL_CFG,
      baseUrl: "https://openrouter.ai/api/v1",
    };
    const state: StubState = { bodies: [] };
    const stub = makeStubFetch(state);
    await expect(
      collect(streamMeshReading({ edge: SPOUSE, config: cloudUnderLocalOnly, fetchImpl: stub })),
    ).rejects.toThrow(PrivacyViolationError);
    expect(state.bodies).toHaveLength(0);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const state: StubState = { bodies: [] };
    await expect(
      collect(
        streamMeshReading({
          edge: SPOUSE,
          config: LOCAL_CFG,
          signal: controller.signal,
          fetchImpl: makeStubFetch(state),
        }),
      ),
    ).rejects.toThrow(/aborted/i);
    expect(state.bodies).toHaveLength(0);
  });
});
