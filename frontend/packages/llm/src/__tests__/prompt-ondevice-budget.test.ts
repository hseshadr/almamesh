// TDD (on-device chat defects, fix 3): the ENGINE-AWARE prompt budget.
//
// The on-device (WebLLM) models ship a 4096-token context window, and WebLLM
// THROWS on overflow instead of truncating. The cloud-sized chat prompt
// (3072-token history + 1200-token reading + an uncapped raw-predictive block)
// cannot fit, so `buildChatMessages` takes a budget PROFILE: the cloud profile
// keeps today's bytes (locked by the golden snapshots), the on-device profile
// composes a prompt that leaves ≥1k tokens of generation headroom inside the
// 4096 window. All fixtures are SYNTHETIC.

import { describe, expect, it } from "vitest";

import { estimateTokens, type ChatTurn } from "../budget";
import type { ChatMessage } from "../client";
import { PREDICTIVE_BLOCK_START } from "../predictive-facts";
import {
  buildChatMessages,
  chatBudgetForEngine,
  CLOUD_CHAT_BUDGET,
  ONDEVICE_CHAT_BUDGET,
} from "../prompt";
import type { SanitizedChart, SanitizedPredictive } from "../sanitize";

// --- fixed synthetic chart (same synthetic shape the other prompt suites use) --

const PREDICTIVE: SanitizedPredictive = {
  transits: {
    gochara: [
      {
        graha: "saturn",
        sign: "pisces",
        house_from_lagna: 12,
        house_from_moon: 8,
        is_retrograde: true,
      },
    ],
    sade_sati: {
      is_active: true,
      current_phase: "peak",
      natal_moon_sign: "aquarius",
      until_month: "2033-04",
    },
    fusion: {
      maha_lord: "saturn",
      antar_lord: "mercury",
      maha_lord_transit_house_from_moon: 8,
      maha_lord_transit_house_from_lagna: 12,
      reinforcing: ["jupiter"],
      afflicting: ["mars"],
      severity: "challenging",
    },
    slow_hits: [
      {
        graha: "jupiter",
        kind: "return",
        natal_point: "jupiter",
        month: "2030-05",
        severity: "supportive",
      },
    ],
    timeline: [
      {
        month: "2030-03",
        kind: "sign_ingress",
        graha: "saturn",
        from_sign: "aquarius",
        to_sign: "pisces",
        severity: "challenging",
        descriptor: "Saturn enters Pisces",
      },
    ],
  },
  strength: {
    sav_total: 337,
    shadbala: [
      { planet: "saturn", total_rupas: 5.21, required_rupas: 5, meets_minimum: true },
    ],
  },
};

const CHART: SanitizedChart = {
  ayanamsa_value: 24.1,
  lagna: {
    longitude: 12.3,
    sign: "aries",
    sign_degrees: 12.3,
    sign_lord: "mars",
    nakshatra: "ashwini",
    nakshatra_pada: 2,
    nakshatra_lord: "ketu",
  },
  planets: {
    mars: {
      name: "mars",
      longitude: 280.5,
      latitude: 0,
      distance: 1,
      speed: 0.5,
      is_retrograde: false,
      sign: "capricorn",
      sign_degrees: 10.5,
      sign_lord: "saturn",
      nakshatra: "shravana",
      nakshatra_pada: 1,
      nakshatra_lord: "moon",
      house: 10,
      dignity: "exalted",
      is_combust: false,
      combustion_separation_deg: null,
      houses_ruled: [1, 8],
      is_yogakaraka: false,
    },
  },
  houses: {},
  yogas: [],
  dashas: {
    maha_dasha_sequence: [],
    current_maha: { lord: "sun", duration_years: 6, months_remaining: 48 },
    current_antar: { lord: "mercury", duration_years: 6, months_remaining: 9 },
    current_pratyantar: null,
  },
  predictive: PREDICTIVE,
};

// --- maximal SYNTHETIC inputs: long history + long reading + RAG snippets ----

const FILLER =
  "The synthetic native reflected on discipline, patience, and steady building. ";

/** A long alternating history (~10k tokens before trimming). */
const LONG_HISTORY: readonly ChatTurn[] = Array.from({ length: 40 }, (_, i) => ({
  role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
  content: `Turn ${i}: ${FILLER.repeat(12)}`,
}));

/** A serialized reading far over every interp budget (~4k tokens). */
const LONG_READING = `Summary: ${FILLER.repeat(200)}`;

const RETRIEVED = [
  "earlier: the synthetic native asked about career timing",
  "earlier: Saturn discipline came up in a prior conversation",
];

const QUESTION = "How does my current dasha shape my career this year?";

function promptTokens(messages: readonly ChatMessage[]): number {
  return messages.reduce((total, m) => total + estimateTokens(m.content), 0);
}

function build(budget: typeof CLOUD_CHAT_BUDGET): ChatMessage[] {
  return buildChatMessages(
    CHART,
    QUESTION,
    "layman",
    LONG_HISTORY,
    RETRIEVED,
    LONG_READING,
    "en",
    undefined,
    undefined,
    budget,
  );
}

describe("chatBudgetForEngine — the engine → profile seam", () => {
  it("maps the webllm engine to the on-device profile", () => {
    expect(chatBudgetForEngine("webllm")).toBe(ONDEVICE_CHAT_BUDGET);
  });

  it("maps anything else (openai-http, undefined-ish) to the cloud profile", () => {
    expect(chatBudgetForEngine("openai-http")).toBe(CLOUD_CHAT_BUDGET);
    expect(chatBudgetForEngine("")).toBe(CLOUD_CHAT_BUDGET);
  });
});

describe("buildChatMessages — ON-DEVICE budget profile (4096-token window)", () => {
  it("a maximal prompt stays ≤ 3000 tokens (≥ 1k generation headroom in 4096)", () => {
    const messages = build(ONDEVICE_CHAT_BUDGET);
    expect(promptTokens(messages)).toBeLessThanOrEqual(3000);
  });

  it("drops the raw-predictive engine block (the natal facts stay)", () => {
    const [, ...rest] = build(ONDEVICE_CHAT_BUDGET);
    const userContent = rest[rest.length - 1].content;
    expect(userContent).not.toContain(PREDICTIVE_BLOCK_START);
    // The compact natal facts still ground the answer.
    expect(userContent).toContain("Ascendant (Lagna): aries");
  });

  it("truncates the folded-in reading to the smaller on-device budget", () => {
    const messages = build(ONDEVICE_CHAT_BUDGET);
    const userContent = messages[messages.length - 1].content;
    expect(userContent).toContain("…(reading truncated)");
    // The whole user turn (facts + truncated reading + RAG + question) must be
    // well under the window on its own.
    expect(estimateTokens(userContent)).toBeLessThanOrEqual(2200);
  });

  it("still keeps the most recent history turns (drop-oldest, not drop-all)", () => {
    const messages = build(ONDEVICE_CHAT_BUDGET);
    const historyTurns = messages.slice(1, -1);
    expect(historyTurns.length).toBeGreaterThan(0);
    expect(historyTurns[historyTurns.length - 1].content).toContain("Turn 39");
  });
});

describe("buildChatMessages — CLOUD profile stays byte-identical (default)", () => {
  it("omitting the budget argument IS the cloud profile, byte for byte", () => {
    const explicit = build(CLOUD_CHAT_BUDGET);
    const defaulted = buildChatMessages(
      CHART,
      QUESTION,
      "layman",
      LONG_HISTORY,
      RETRIEVED,
      LONG_READING,
      "en",
      undefined,
      undefined,
    );
    expect(defaulted).toEqual(explicit);
  });

  it("the cloud profile keeps the raw-predictive block and out-budgets on-device", () => {
    const cloud = build(CLOUD_CHAT_BUDGET);
    const onDevice = build(ONDEVICE_CHAT_BUDGET);
    const cloudUser = cloud[cloud.length - 1].content;
    expect(cloudUser).toContain(PREDICTIVE_BLOCK_START);
    expect(promptTokens(cloud)).toBeGreaterThan(promptTokens(onDevice));
  });
});
