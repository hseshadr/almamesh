# Spec 063 — AI Tiers: No-AI Default, On-Device Opt-In, Cloud Stronger

**Status:** Approved (owner, 2026-07-02)
**Surfaces:** `@almamesh/llm`, `apps/web` (settings, rectify gate, landing, SW config), docs

## TL;DR

AlmaMesh's default stays **no AI at all** — and we start *saying so* as a feature.
Two clearly-labeled opt-in tiers: **On-device AI (beta)** — a rebuilt WebLLM engine
running Qwen3-1.7B in the browser, private by construction, scoped to chat + the
rectification interview + the life-event extractor — and **Cloud AI (stronger)** —
the existing OpenRouter/BYO path, PII-scrubbed. Plus a fence-violation benchmark
harness that scores candidate models against the engine's ground truth.

Messaging in one line: *"Default: no AI — your chart is pure calculation, nothing
leaves your device. Optional: add AI narration — on-device (private) or cloud
(stronger, PII-scrubbed)."*

## Ground truth (verified 2026-07-02)

- **The old WebLLM path is GONE, not dormant**: zero deps, zero code, history purged
  at public release (`bc8ac76`). Stale docs claim otherwise — fix them
  (`README.md:57-60`, `frontend/README.md:35,55,90-94`, `docs/code-guidelines.md:27`,
  root `CLAUDE.md`; leave `CHANGELOG.md` history as-is). Old capability-probe logic
  is minable from `~/almamesh-prepublic-history-backup.bundle` (reference only).
- **Blessed model: `Qwen3-1.7B-q4f16_1-MLC`** — zero-config in WebLLM 0.2.84's
  registry, 968 MB download, ~2.0 GB VRAM, Apache-2.0, real es/pt coverage.
  Lighter alternative offered in the picker: `Llama-3.2-1B-Instruct-q4f16_1-MLC`
  (695 MB, 879 MB VRAM, Llama license). Pluggable `BLESSED_ONDEVICE_MODELS` list —
  the harness can re-rank without code changes. Qwen3 `<think>` hazard neutralized
  via `enable_thinking: false`; JSON validity **enforced** via xgrammar
  `response_format: {type: "json_object", schema}`.
- **Disqualified**: SmolLM3-3B (no MLC artifact, unsupported arch);
  Phi-4-mini & Qwen3-4B (~2.2 GB, over the download ceiling).
- **Weights hosting (v1)**: MLC/HuggingFace CDN + WebLLM's own Cache API caching,
  with explicit UI disclosure ("downloads ~1 GB from huggingface.co; cached on this
  device; works offline afterwards") + `navigator.storage.persist()` request.
  Self-hosting requires R2 (shards up to ~156 MB > Pages' 25 MiB cap) — documented
  follow-up, NOT v1. The no-CDN rule protects the default zero-egress chart path;
  this is an opt-in with honest disclosure.
- **Capability gating**: WebGPU required (`navigator.gpu` probe). iOS Safari 26+ and
  macOS Tahoe+ only on Safari; Chrome/Edge 113+ fine. Unsupported → honest
  "not supported on this device" state (orphaned `settings.json` `model.*` copy
  already has `no_webgpu_*` keys in en/es/pt — reuse).

## Design

### D1 — Provider kind `on_device` (packages/llm)

- `LlmEngine` union gains `"webllm"` (`provider.ts:10`); `LlmProviderKind` gains
  `"on_device"` (`settings.ts:51`); `describeLlmStatus` maps it.
- New `packages/llm/src/webllm/`: capability probe (WebGPU + rough memory check),
  engine singleton (lazy `import("@mlc-ai/web-llm")` — the library must never load
  unless the tier is enabled), `ChatStreamProvider` impl (messages→token deltas,
  `enable_thinking: false`), download-progress callback surface, and a
  **JSON-completion capability** (xgrammar `response_format` with schema).
- **Routing**: `routeChatCompletion` (`route.ts:24-33`) branches on `config.engine`.
  NEW routed seam `routeCompletionJson` — `structureLifeEvents` (`client.ts:106`
  `chatCompletionJson`, currently bypassing the router) moves onto it; openai-http
  behavior byte-preserved.
- **Privacy model**: `ensurePrivacy` treats `engine === "webllm"` as trivially
  private (no baseUrl); PII sanitization still applies unchanged (defense in depth).
  New egress test: on_device inference makes ZERO network calls (weights download
  excluded, tested separately). The `local_only` URL-based path is untouched.
- **Scope fence**: structured 6-section interpretation is NOT served on-device in
  v1 — `streamStructuredInterpretation` on a webllm config throws a typed
  `OnDeviceUnsupportedError` the UI turns into honest copy ("On-device AI handles
  chat and the interview. For the full written reading, use a cloud or local
  endpoint — stronger models"). Chat, interview streaming, and
  `structureLifeEvents`/`gatherEventsFromTurn` ARE served on-device.
  LITE gate (`structured-interpretation.ts:884-890`) generalizes from
  `isLocalEndpoint(baseUrl)` to "local endpoint OR on_device" for future-proofing.

### D2 — Local life-event extractor (the privacy win)

When on_device is enabled, the rectification interview + extractor run locally —
removing the product's last raw-text-egress caveat. `rectifyLlmConfig.ts`
`isCloudConfigured()` widens to `isAiUsable()` = cloud OR on_device (BYO `local`
Ollama stays gated as today — no xgrammar enforcement there). Gate copy updated:
cloud-or-on-device wording ×3 locales. The typed `{date, category, precision}`
validation stays as the second wall.

### D3 — Settings UI + messaging (apps/web)

- `LlmModelSettings.tsx`: a three-tier layout — **None (default)** / **On-device
  (private, beta)** / **Cloud (stronger)** — with the on-device card offering the
  blessed-model picker (Qwen3-1.7B default, Llama-3.2-1B "lighter"), download
  disclosure + progress, capability-gated states, and delete-downloaded-model.
  Reuse/refresh the orphaned `model.*` i18n block (en:160-174 + es/pt mirrors).
- `AiStatusBadge` shows on_device automatically via `describeLlmStatus`.
- "No AI by default" messaging: landing "Bring your own AI" card copy, settings
  `ai.info_description`, README — state the default plainly as a feature.
- SW (`vite.config.ts`): `globIgnores` the webllm chunk (never precache for
  non-users); weights are WebLLM-cache-managed (no SW rule needed);
  `navigateFallbackDenylist` untouched.

### D4 — Fence-violation benchmark harness (packages/llm/bench)

Node/bun CLI, manual tool (NOT CI). Screens any OpenAI-compatible endpoint:
- Exact on OpenRouter: `meta-llama/llama-3.2-1b-instruct`, `-3b-instruct`,
  `google/gemma-3-4b-it`; upper bound `qwen/qwen3-8b`. Exact Qwen3-0.6B/1.7B/4B +
  Phi-4-mini via HF router (`https://router.huggingface.co/v1`).
- Tasks per model: (a) `structureLifeEvents` extraction accuracy on synthetic
  fixtures (dates/categories/precision), (b) chat narration **fence-violation rate**
  vs engine ground truth — invented lordships, wrong dasha dates, dignity-vocabulary
  violations, mechanically checked against a synthetic chart's engine JSON,
  (c) JSON validity/retry rate, (d) es/pt spot prompts.
- Output: a scored markdown table; the decision input for re-ranking
  `BLESSED_ONDEVICE_MODELS`. Keys via env (`OPENROUTER_API_KEY`, `HF_TOKEN`);
  synthetic natives only.

### Non-negotiables

Determinism untouched (no engine-path changes). All fences byte-preserved. i18n ×3
with parity. TDD. PII grep on every diff. The anti-WebLLM regression guards in
`config.test.ts` ("never returns a legacy engine") are REWRITTEN deliberately for
the three-kind world, not deleted. Live validation: drive the real built app —
settings tier reachable, capability messaging, disclosure copy, gate copy on the
interview; full-download inference validated via a manual gated script with
Qwen3-0.6B (335 MB) at minimum, honestly reported if not driven.

## Out of scope (documented follow-ups)

R2 self-hosted weights (+ optional signed-OPFS provenance parity); on-device
structured interpretation; auto VRAM-probe model selection; mesh narration
on-device; Qwen3.5 upgrades (registry already has them).
