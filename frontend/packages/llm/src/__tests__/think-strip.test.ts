// TDD (on-device chat defects, fix 2): the defensive leading-empty-<think>
// strip. WebLLM 0.2.84 reacts to `enable_thinking: false` by splicing a literal
// `"<think>\n\n</think>\n\n"` into the prompt AND the decoded stream when the
// model's tokenizer lacks the special token (Llama) — and Qwen3 itself can echo
// the empty block. The provider strips exactly ONE leading empty block (plus
// surrounding whitespace); everything else passes through verbatim.

import { describe, expect, it } from "vitest";

import {
  stripLeadingEmptyThink,
  stripLeadingEmptyThinkStream,
} from "../webllm/think-strip";

async function* from(chunks: readonly string[]): AsyncGenerator<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collect(source: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of source) {
    out.push(delta);
  }
  return out;
}

describe("stripLeadingEmptyThink — assembled text", () => {
  it("strips the exact WebLLM injection literal", () => {
    expect(stripLeadingEmptyThink("<think>\n\n</think>\n\nNamaste")).toBe("Namaste");
  });

  it("strips leading whitespace before the empty block", () => {
    expect(stripLeadingEmptyThink("  \n<think> </think> Hello")).toBe("Hello");
  });

  it("leaves content without a think block untouched", () => {
    expect(stripLeadingEmptyThink("Your Mars is exalted.")).toBe("Your Mars is exalted.");
  });

  it("leaves a NON-empty think block untouched (only the empty injection is garbage)", () => {
    const text = "<think>real reasoning</think>\nanswer";
    expect(stripLeadingEmptyThink(text)).toBe(text);
  });

  it("a completion that is ONLY the empty block strips to nothing", () => {
    expect(stripLeadingEmptyThink("<think>\n\n</think>\n\n")).toBe("");
  });
});

describe("stripLeadingEmptyThinkStream — token deltas", () => {
  it("strips the empty block even when tags split across chunk boundaries", async () => {
    const deltas = await collect(
      stripLeadingEmptyThinkStream(from(["<th", "ink>\n", "\n</th", "ink>\n\nNam", "aste"])),
    );
    expect(deltas.join("")).toBe("Namaste");
  });

  it("flushes immediately once the prefix diverges (no needless buffering)", async () => {
    const deltas = await collect(stripLeadingEmptyThinkStream(from(["Hello", " world"])));
    expect(deltas).toEqual(["Hello", " world"]);
  });

  it("passes a non-empty think block through verbatim", async () => {
    const deltas = await collect(
      stripLeadingEmptyThinkStream(from(["<think>rea", "soning</think>ok"])),
    );
    expect(deltas.join("")).toBe("<think>reasoning</think>ok");
  });

  it("yields nothing for a stream that is only the empty block", async () => {
    const deltas = await collect(
      stripLeadingEmptyThinkStream(from(["<think>", "\n\n", "</think>", "\n\n"])),
    );
    expect(deltas).toEqual([]);
  });

  it("propagates source errors (abort semantics stay intact)", async () => {
    async function* failing(): AsyncGenerator<string> {
      yield "ok";
      throw new Error("boom");
    }
    await expect(collect(stripLeadingEmptyThinkStream(failing()))).rejects.toThrow("boom");
  });
});
