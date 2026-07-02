// In-process mock OpenAI-compatible endpoint for --dry-run and unit tests.
//
// Proves the whole pipeline (real prompts -> transport -> scoring -> report)
// without any network or key. The canned answers contain DELIBERATE fence
// violations so a dry run demonstrates the checker firing end-to-end:
//   - chat/en: "saturn rules the 3rd house" — false for every bundled fixture
//     (saturn rules 7,8 or 10,11), plus an invented "Gaja-Kesari" yoga claim.
//   - chat/es: "Saturno está exaltado" — false for every bundled fixture.
//   - extractor: first call returns malformed JSON (exercises the retry
//     path), later calls return the story's expected rows with ONE mangled
//     category (exercises the accuracy math: score must be < 100%).

import { STORIES } from "../fixtures/stories";

import type { FetchLike } from "./openaiClient";

interface OpenAiRequestBody {
  readonly model?: string;
  readonly messages?: ReadonlyArray<{ role: string; content: string }>;
  readonly response_format?: { type?: string };
}

const CHAT_EN =
  "You are currently in a strong planetary period. Saturn rules the 3rd house, which brings courage to your career. " +
  "You also have the famous Gaja-Kesari yoga in your chart. Overall the coming years look steady for work.";

const CHAT_ES =
  "Tu carta muestra un momento estable. Saturno esta exaltado y eso fortalece tu carrera durante los proximos anos. " +
  "Es un buen periodo para avanzar con tus metas.";

const CHAT_PT =
  "Seu mapa mostra um momento estavel na carreira. Voce pode avancar com seus planos durante os proximos anos, " +
  "mas nao ha pressa em decisoes grandes.";

function completion(content: string, model: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: {
        prompt_tokens: 800,
        completion_tokens: Math.ceil(content.length / 4),
      },
      model,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function extractorAnswer(userText: string): string {
  const story = STORIES.find((s) => userText.includes(s.text) || s.text.includes(userText));
  if (!story) {
    return JSON.stringify({ events: [] });
  }
  // Mangle exactly one category on the first story so accuracy lands < 100%.
  const events = story.expected.map((row, i) =>
    story.id === STORIES[0].id && i === 0 ? { ...row, category: "relocation" } : row,
  );
  return JSON.stringify({ events });
}

/**
 * Build a mock fetch. Stateful: the FIRST extractor call returns malformed
 * JSON so the bench's retry accounting is exercised in every dry run.
 */
export function createMockFetch(): FetchLike {
  let extractorCalls = 0;
  const mock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    void input;
    const body = JSON.parse(String(init?.body ?? "{}")) as OpenAiRequestBody;
    const model = body.model ?? "mock-model";
    const messages = body.messages ?? [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const system = messages.find((m) => m.role === "system")?.content ?? "";

    if (body.response_format?.type === "json_object") {
      extractorCalls += 1;
      if (extractorCalls === 1) {
        return completion("{ this is not valid json", model);
      }
      return completion(extractorAnswer(lastUser), model);
    }

    // Chat: answer in the requested language; Qwen3 slugs prepend a think
    // block so think-stripping is exercised too.
    const wantsEs = /spanish|espanol/i.test(system);
    const wantsPt = /portuguese|portugues/i.test(system);
    let content = wantsEs ? CHAT_ES : wantsPt ? CHAT_PT : CHAT_EN;
    if (/qwen-?3/i.test(model)) {
      content = `<think>reasoning that must never be scored</think>${content}`;
    }
    return completion(content, model);
  };
  return mock as FetchLike;
}
