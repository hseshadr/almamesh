# Fence-violation benchmark harness (Spec 063 D4)

**TL;DR** — a manual bun CLI that screens candidate small models (for the
on-device AI tier) over any OpenAI-compatible endpoint and scores them on the
two things that actually matter for AlmaMesh: **truthfulness against the
engine** (fence violations, mechanically checked) and **format reliability**
(JSON validity + field-exact life-event extraction). Output: a ranked markdown
table in `bench/results/` — the decision input for re-ranking
`BLESSED_ONDEVICE_MODELS`. This is a **manual tool, never CI**.

## Quickstart

```bash
cd frontend/packages/llm

# No key needed — mocked endpoint, proves the whole pipeline end-to-end:
bun run bench -- --dry-run

# One model on OpenRouter (key from env):
export OPENROUTER_API_KEY=sk-or-...   # or source your shell profile
bun run bench -- --base https://openrouter.ai/api/v1 \
  --model meta-llama/llama-3.2-1b-instruct --key-env OPENROUTER_API_KEY

# The documented candidate set (OpenRouter + HF router; models whose key env
# is missing are skipped honestly, they never kill the suite):
export HF_TOKEN=hf_...
bun run bench -- --suite
```

Flags: `--max-tokens N` (per chat answer, default 450), `--spend-cap N`
(completion tokens per model, default 30000; an estimate prints before any
network call), `--models a,b,c` (subset the suite by exact slug, e.g. a cheap
smoke run: `--suite --models meta-llama/llama-3.2-1b-instruct,google/gemma-3-4b-it`).
Suite concurrency is fixed at ≤ 2.

Reports land in `bench/results/<timestamp>.md` (gitignored).

## Realistic example

```bash
$ bun run bench -- --dry-run
Models: 3. Estimated completion-token spend: ~7050 per model (~21150 total), cap 30000/model. Concurrency ≤ 2.
DRY RUN: mocked endpoint, no network calls, no keys used.

=== meta-llama/llama-3.2-1b-instruct @ https://openrouter.ai/api/v1
  extractor: 23/24 matched, 6/7 JSON-valid first try, 1 retries
  chat: 8 violations in 1155 tokens (6.93/1k), es 2/2, pt 2/2
...
Report written: .../bench/results/2026-07-02T....md
```

## What is measured, per model

| Task | How | Scored |
|---|---|---|
| Extractor accuracy | The REAL `structureLifeEvents` (production prompt + validation, imported from `src/`) runs against 7 synthetic stories (en/es/pt, all 17 event categories, all 4 precisions) | field-exact matches (precision-aware dates), JSON validity on first try, retry count |
| Chat fence rate | The REAL `buildChatMessages` facts block on a synthetic golden chart; 7 en questions incl. deliberate bait (lordship/dignity/yoga/dasha-date) | fence violations per 1k completion tokens, with the violating excerpts as evidence |
| es/pt spot check | 2 questions each against a second fixture chart | stopword-heuristic in-language rate + fence rate |
| Latency | wall-clock p50 across all requests | informational |

Composite = extraction ×0.4 + fence cleanliness ×0.4 + JSON validity ×0.1 +
es/pt in-language ×0.1 (formula printed in every report).

## The fence checker (`src/fenceCheck.ts`)

Given a chart's engine JSON, it mechanically flags narration that contradicts:

- **lordships** — "Saturn rules the 3rd house", "the lord of the 7th is
  Venus", "Venus, your 7th lord", "7th lord Venus", lagna-lord claims, word
  ordinals, multi-house lists — checked against `houses_ruled` (node lordship
  claims always flag: Rahu/Ketu rule nothing here);
- **dasha dates** — years / month-years inside dasha-context sentences,
  checked against every dated engine window (maha + antar + pratyantar tree),
  level-aware when the sentence names one level;
- **dignity vocabulary** — exalted / debilitated / own-sign (+ es/pt forms)
  bound to the nearest planet, checked against the engine `dignity` field
  (note: the JSON boundary emits `own`, not `own_sign`);
- **invented yogas** — "<Name> yoga" claims not in the chart's detected-yoga
  list (hyphen/spacing-insensitive; category-generic mentions like "a raja
  yoga" pass when the chart HAS that category).

**Precision over recall, deliberately.** A flagged violation must be real.
Known blind spots (accepted, documented):

- paraphrased derivations without the keywords ("the ruler of your career
  house" with no number/planet pairing);
- sign-rulership claims ("Jupiter rules Sagittarius") — out of scope;
- es/pt lordship grammar ("Saturno rige la tercera casa") — only dignity,
  dasha-date and yoga checks work cross-language;
- navamsa/divisional dignity talk is skipped wholesale (would false-flag);
- negated or hypothetical sentences are skipped wholesale;
- dignity matching is **attributive-form only** ("is exalted", "in
  exaltation"); bare noun preambles ("as for exaltation and debilitation…")
  are skipped — they false-flagged in the first live run;
- invented-yoga detection requires a **Capitalized** name run before "yoga"
  ("Neecha Bhanga yoga" flags; an all-lowercase invented name slips through) —
  generic prose like "several significant yogas" false-flagged without this;
- a fabricated yoga hidden behind a real suffix ("Neecha Bhanga **Raja**
  Yoga") passes the category fallback;
- duplicate flags for the same (kind, sentence, detail) are deduped — a claim
  repeated verbatim counts once;
- violation counts are a **floor**, not a ceiling.

## Honest caveats about the numbers

- **Server quant ≠ browser quant.** OpenRouter / HF router serve fp16/fp8/int8
  builds; the browser tier runs q4f16_1 MLC artifacts. Use these results to
  RANK candidates, then confirm the winner on the real WebLLM path.
- **OpenRouter proxies providers per slug** and the HF router picks backends —
  provider drift between runs is real (temperature pinned at 0.2).
- Single sample per question (cost guard): fence-rate differences under
  ~1 violation/1k tokens are ties.
- Qwen3 models get `/no_think` and any leaked `<think>` blocks are stripped
  before scoring; the report's "Think blocks" column counts the leaks.

## Fixtures — synthetic natives ONLY

`fixtures/chart-*.json` were generated with the engine CLI from invented birth
data (PII hard gate enforced by a unit test AND the pre-commit grep):

```bash
cd backend
uv run almamesh-chart "1988-08-08T00:44:00+00:00" 12.9716 77.5946   # "Bengaluru 1988"
uv run almamesh-chart "1990-04-20T03:00:00+00:00" 35.6762 139.6503  # "Tokyo 1990"
uv run almamesh-chart "1995-12-01T18:30:00+00:00" -23.5505 -46.6333 # "São Paulo 1995"
```

`fixtures/stories.ts` / `fixtures/questions.ts` are equally synthetic.

## Tests & typecheck

The harness has its own unit tests (mocked endpoints, no network) and its own
tsconfig — neither is wired into the package's CI scripts, keeping the
browser-targeted package untouched:

```bash
cd frontend/packages/llm
bunx vitest run -c bench/vitest.config.ts   # bench unit tests
bunx tsc -p bench/tsconfig.json             # bench typecheck (noEmit)
```
