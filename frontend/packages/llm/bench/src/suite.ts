// The documented candidate set for BLESSED_ONDEVICE_MODELS re-ranking
// (Spec 063 D4). Slugs are EXACT and endpoint-specific.
//
// Server-side quantization on these endpoints differs from WebLLM's browser
// q4f16_1 artifacts — results are a screening signal, not a browser-identical
// measurement (see the caveats section of every generated report).

import { OPENROUTER_API_BASE } from "../../src/config";

import type { ModelSpec } from "./types";

export const HF_ROUTER_BASE = "https://router.huggingface.co/v1";

export const SUITE: readonly ModelSpec[] = [
  {
    slug: "meta-llama/llama-3.2-1b-instruct",
    baseUrl: OPENROUTER_API_BASE,
    keyEnv: "OPENROUTER_API_KEY",
    note: "WebLLM candidate (Llama-3.2-1B-Instruct-q4f16_1-MLC, 695 MB)",
  },
  {
    slug: "meta-llama/llama-3.2-3b-instruct",
    baseUrl: OPENROUTER_API_BASE,
    keyEnv: "OPENROUTER_API_KEY",
    note: "WebLLM candidate (Llama-3.2-3B q4f16_1)",
  },
  {
    slug: "google/gemma-3-4b-it",
    baseUrl: OPENROUTER_API_BASE,
    keyEnv: "OPENROUTER_API_KEY",
    note: "WebLLM candidate (gemma-3-4b-it q4f16_1)",
  },
  {
    slug: "qwen/qwen3-8b",
    baseUrl: OPENROUTER_API_BASE,
    keyEnv: "OPENROUTER_API_KEY",
    note: "UPPER BOUND — too large for the browser; calibration only",
  },
  {
    slug: "Qwen/Qwen3-0.6B",
    baseUrl: HF_ROUTER_BASE,
    keyEnv: "HF_TOKEN",
    note: "WebLLM candidate (Qwen3-0.6B q4f16_1, 335 MB)",
  },
  {
    slug: "Qwen/Qwen3-1.7B",
    baseUrl: HF_ROUTER_BASE,
    keyEnv: "HF_TOKEN",
    note: "CURRENT BLESSED DEFAULT (Qwen3-1.7B-q4f16_1-MLC, 968 MB)",
  },
  {
    slug: "Qwen/Qwen3-4B",
    baseUrl: HF_ROUTER_BASE,
    keyEnv: "HF_TOKEN",
    note: "over the download ceiling (~2.2 GB); calibration",
  },
  {
    slug: "microsoft/Phi-4-mini-instruct",
    baseUrl: HF_ROUTER_BASE,
    keyEnv: "HF_TOKEN",
    note: "over the download ceiling (~2.2 GB); calibration",
  },
];
