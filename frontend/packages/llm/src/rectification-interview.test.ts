// rectification-interview.test.ts
//
// TDD suite for the conversational birth-time-event interview layer.
//
// Isolation strategy:
//   - structureLifeEvents is vi.mock'd at module level so gatherEventsFromTurn
//     never touches the network.
//   - streamRectificationInterview is tested via sseFetch (the same ReadableStream
//     SSE stub used in route.test.ts), so routeChatCompletion never hits the
//     network either.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LIFE_EVENT_CATEGORIES } from "@almamesh/shared-types";

import type { ChatTurn } from "./budget";
import type { ProviderConfig } from "./config";
import { RECTIFICATION_FENCE } from "./prompt";
import {
  buildInterviewMessages,
  gatherEventsFromTurn,
  streamRectificationInterview,
  type InterviewGatheredEvent,
} from "./rectification-interview";
import { structureLifeEvents } from "./structure-life-events";

vi.mock("./structure-life-events", () => ({
  structureLifeEvents: vi.fn(),
}));

const mockStructure = vi.mocked(structureLifeEvents);

const HTTP_CFG: ProviderConfig = {
  engine: "openai-http",
  model: "test-model",
  privacyMode: "local_only",
  baseUrl: "http://localhost:11434/v1",
};

/** SSE fetch stub — mirrors the pattern in route.test.ts. */
function sseFetch(content: string): typeof fetch {
  return vi.fn(async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: {"choices":[{"delta":{"content":"${content}"}}]}\n\n`),
        );
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }) as unknown as typeof fetch;
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of gen) out.push(delta);
  return out;
}

// =============================================================================
// buildInterviewMessages
// =============================================================================

describe("buildInterviewMessages", () => {
  const history: ChatTurn[] = [{ role: "user", content: "I married in 2004" }];
  const msgs = buildInterviewMessages(history, "en");

  it("starts with a system message that embeds the rectification fence verbatim", () => {
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain(RECTIFICATION_FENCE);
  });

  it("system prompt enforces one-question-at-a-time persona", () => {
    // "ONE" appears in the persona instruction
    expect(msgs[0].content).toContain("ONE");
  });

  it("system prompt has an explicit NO-VERDICT clause (never declare birth time/rising sign/Ascendant)", () => {
    expect(msgs[0].content.toLowerCase()).toMatch(/never.*(birth time|rising sign|ascendant)/s);
  });

  it("lists all 16 life-event categories so per-turn extraction shares vocabulary", () => {
    for (const cat of LIFE_EVENT_CATEGORIES) {
      expect(msgs[0].content).toContain(cat);
    }
  });

  it("mentions the ~3-events-is-enough invite-to-review cue", () => {
    expect(msgs[0].content).toMatch(/3/);
  });

  it("appends the history turns after the system message", () => {
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "I married in 2004" });
  });

  it("works with an empty history (system message only)", () => {
    const empty = buildInterviewMessages([], "en");
    expect(empty).toHaveLength(1);
    expect(empty[0].role).toBe("system");
  });

  it("threads the Spanish language instruction for language='es'", () => {
    const es = buildInterviewMessages([], "es");
    expect(es[0].content).toContain("Spanish");
  });

  it("threads the Portuguese language instruction for language='pt'", () => {
    const pt = buildInterviewMessages([], "pt");
    expect(pt[0].content).toContain("Portuguese");
  });

  it("is a no-op for 'en' (no language suffix added)", () => {
    const en = buildInterviewMessages([], "en");
    // Spanish/Portuguese instruction must not appear for English
    expect(en[0].content).not.toContain("Write your entire response in Spanish");
    expect(en[0].content).not.toContain("Write your entire response in Portuguese");
  });

  it("preserves multi-turn history order", () => {
    const multi: ChatTurn[] = [
      { role: "user", content: "turn 1" },
      { role: "assistant", content: "turn 2" },
      { role: "user", content: "turn 3" },
    ];
    const result = buildInterviewMessages(multi, "en");
    expect(result).toHaveLength(4); // system + 3 turns
    expect(result[1]).toEqual({ role: "user", content: "turn 1" });
    expect(result[2]).toEqual({ role: "assistant", content: "turn 2" });
    expect(result[3]).toEqual({ role: "user", content: "turn 3" });
  });

  it("elicits what a rectifier needs: exact dates + distinct life domains, without leading", () => {
    // Spec 062 (LLM delta 2 preamble): the persona explains WHY exact dates
    // matter and pushes for precision across DISTINCT domains — but never leads.
    const persona = buildInterviewMessages([], "en")[0].content;
    expect(persona).toMatch(/EXACTLY-DATED/i);
    expect(persona).toMatch(/distinct life domains/i);
    expect(persona).toMatch(/never lead/i);
  });
});

// =============================================================================
// buildInterviewMessages — gathered-state block (Spec 062, LLM delta 2)
// =============================================================================

describe("buildInterviewMessages — interview state block", () => {
  const GATHERED: InterviewGatheredEvent[] = [
    { date: "2004-06-15", category: "marriage", precision: "month" },
    { date: "2011-02-01", category: "relocation", precision: "exact" },
  ];

  it("renders each gathered event as {date, category, precision} ONLY", () => {
    const msgs = buildInterviewMessages([], "en", GATHERED);
    const system = msgs[0].content;
    expect(system).toContain("INTERVIEW STATE");
    expect(system).toContain("2004-06-15 (marriage, month)");
    expect(system).toContain("2011-02-01 (relocation, exact)");
  });

  it("lists the categories still missing so the model can diversify", () => {
    const msgs = buildInterviewMessages([], "en", GATHERED);
    const system = msgs[0].content;
    expect(system).toContain("Categories not yet gathered");
    expect(system).toContain("litigation"); // a missing category is listed…
    const missingLine = system
      .split("\n")
      .find((l) => l.includes("Categories not yet gathered"))!;
    expect(missingLine).not.toContain("marriage"); // …a gathered one is not
    expect(missingLine).not.toContain("relocation");
  });

  it("carries the elicitation strategy: exact dates, de-correlation, Ascendant-sensitive domains", () => {
    const system = buildInterviewMessages([], "en", GATHERED)[0].content;
    expect(system).toMatch(/exact dates score sharpest/i);
    expect(system).toMatch(/de-correlat/i); // mirrors the engine's de-correlation
    expect(system).toMatch(/category not yet gathered/i);
    expect(system).toMatch(/Ascendant-sensitive/i);
  });

  it("renders a 'none yet' state block when gathered is empty (strategy still rides)", () => {
    const system = buildInterviewMessages([], "en", [])[0].content;
    expect(system).toContain("INTERVIEW STATE");
    expect(system).toContain("none yet");
    expect(system).toMatch(/exact dates score sharpest/i);
  });

  it("PII boundary: never leaks a summary/note smuggled past the type", () => {
    const smuggled = [
      {
        date: "2004-06-15",
        category: "marriage",
        precision: "exact",
        summary: "SECRET WEDDING NOTE",
        note: "SECRET NOTE",
      } as unknown as InterviewGatheredEvent,
    ];
    const system = buildInterviewMessages([], "en", smuggled)[0].content;
    expect(system).not.toContain("SECRET WEDDING NOTE");
    expect(system).not.toContain("SECRET NOTE");
  });

  it("keeps the persona + RECTIFICATION_FENCE byte-intact when the state block rides", () => {
    const bare = buildInterviewMessages([], "en")[0].content;
    const withState = buildInterviewMessages([], "en", GATHERED)[0].content;
    expect(withState.startsWith(bare)).toBe(true); // persona prefix untouched
    expect(withState).toContain(RECTIFICATION_FENCE);
  });

  it("omitting the state param keeps the legacy prompt byte-identical", () => {
    const legacy = buildInterviewMessages([], "en");
    const explicit = buildInterviewMessages([], "en", undefined);
    expect(explicit).toEqual(legacy);
    expect(legacy[0].content).not.toContain("INTERVIEW STATE");
  });
});

// =============================================================================
// streamRectificationInterview
// =============================================================================

describe("streamRectificationInterview", () => {
  it("yields SSE tokens via fetchImpl", async () => {
    const fetchImpl = sseFetch("Hello!");
    const deltas = await collect(
      streamRectificationInterview({
        history: [{ role: "user", content: "I married in 2004" }],
        config: HTTP_CFG,
        language: "en",
        fetchImpl,
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(deltas).toEqual(["Hello!"]);
  });

  it("works with an empty history (opening turn)", async () => {
    const fetchImpl = sseFetch("What milestone shall we start with?");
    const deltas = await collect(
      streamRectificationInterview({ history: [], config: HTTP_CFG, fetchImpl }),
    );
    expect(deltas).toEqual(["What milestone shall we start with?"]);
  });

  it("threads the gathered-state block into the outgoing request", async () => {
    let requestBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      requestBody = String(init?.body ?? "");
      const stream = new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
      return new Response(stream, { status: 200 });
    }) as unknown as typeof fetch;

    await collect(
      streamRectificationInterview({
        history: [],
        config: HTTP_CFG,
        fetchImpl,
        state: [{ date: "2004-06-15", category: "marriage", precision: "month" }],
      }),
    );
    expect(requestBody).toContain("INTERVIEW STATE");
    expect(requestBody).toContain("2004-06-15 (marriage, month)");
  });

  it("forwards the abort signal to the underlying fetch", async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) => {
      seenSignal = init?.signal;
      const stream = new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
      return new Response(stream, { status: 200 });
    }) as unknown as typeof fetch;
    const controller = new AbortController();

    await collect(
      streamRectificationInterview({
        history: [],
        config: HTTP_CFG,
        signal: controller.signal,
        fetchImpl,
      }),
    );
    expect(seenSignal).toBe(controller.signal);
  });
});

// =============================================================================
// gatherEventsFromTurn
// =============================================================================

describe("gatherEventsFromTurn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns status:'error' when structureLifeEvents returns status:'error' (a real failure, NOT an empty turn)", async () => {
    mockStructure.mockResolvedValue({ status: "error" });
    const result = await gatherEventsFromTurn("unparseable text", HTTP_CFG);
    expect(result).toEqual({ status: "error" });
  });

  it("returns typed events (with precision) and attaches the user's own text as each event's summary", async () => {
    const events = [
      { date: "2004-06-15", category: "marriage" as const, precision: "month" as const },
    ];
    mockStructure.mockResolvedValue({ status: "ok", events });
    const result = await gatherEventsFromTurn("I married in June 2004", HTTP_CFG);
    expect(result).toEqual({
      status: "ok",
      events: [
        { date: "2004-06-15", category: "marriage", precision: "month", summary: "I married in June 2004" },
      ],
    });
  });

  it("attaches the SAME user text as summary to every event from a multi-event turn", async () => {
    const events = [
      { date: "2004-06-15", category: "marriage" as const, precision: "month" as const },
      { date: "2008-03-01", category: "relocation" as const, precision: "year" as const },
    ];
    mockStructure.mockResolvedValue({ status: "ok", events });
    const userText = "Married in June 2004, then moved cities in 2008";
    const result = await gatherEventsFromTurn(userText, HTTP_CFG);
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.events.map((e) => e.summary)).toEqual([
      userText,
      userText,
    ]);
  });

  it("trims surrounding whitespace from the attached summary", async () => {
    mockStructure.mockResolvedValue({
      status: "ok",
      events: [{ date: "2004-06-15", category: "marriage", precision: "exact" }],
    });
    const result = await gatherEventsFromTurn("   I married in 2004  ", HTTP_CFG);
    expect(result.status === "ok" && result.events[0]?.summary).toBe("I married in 2004");
  });

  it("returns status:'ok' with an empty events array for a genuinely empty turn", async () => {
    mockStructure.mockResolvedValue({ status: "ok", events: [] });
    const result = await gatherEventsFromTurn("nothing datable here", HTTP_CFG);
    expect(result).toEqual({ status: "ok", events: [] });
  });

  it("passes language through to structureLifeEvents", async () => {
    mockStructure.mockResolvedValue({ status: "ok", events: [] });
    await gatherEventsFromTurn("texto", HTTP_CFG, "es");
    expect(mockStructure).toHaveBeenCalledWith("texto", HTTP_CFG, "es");
  });

  it("defaults language to 'en' when omitted", async () => {
    mockStructure.mockResolvedValue({ status: "ok", events: [] });
    await gatherEventsFromTurn("text", HTTP_CFG);
    expect(mockStructure).toHaveBeenCalledWith("text", HTTP_CFG, "en");
  });

  it("never throws — returns status:'error' even if structureLifeEvents rejects", async () => {
    mockStructure.mockRejectedValue(new Error("network error"));
    await expect(gatherEventsFromTurn("text", HTTP_CFG)).resolves.toEqual({ status: "error" });
  });
});
