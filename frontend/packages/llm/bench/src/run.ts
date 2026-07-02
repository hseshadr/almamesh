// Fence-violation benchmark CLI (Spec 063 D4). MANUAL tool — never CI.
//
//   bun bench/src/run.ts --base <url> --model <slug> [--key-env OPENROUTER_API_KEY]
//   bun bench/src/run.ts --suite            # documented candidate set
//   bun bench/src/run.ts --dry-run          # mocked endpoint, no network/keys
//
// Output: bench/results/<timestamp>.md — a ranked markdown table that is the
// decision input for re-ranking BLESSED_ONDEVICE_MODELS.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SiderealChart } from "@almamesh/browser/types";

import type { ProviderConfig } from "../../src/config";

import { EN_QUESTIONS, ES_QUESTIONS, PT_QUESTIONS } from "../fixtures/questions";
import { STORIES } from "../fixtures/stories";
import { CliArgError, parseArgs, type CliArgs } from "./cliArgs";
import { buildEngineTruth } from "./engineTruth";
import { createMockFetch } from "./mockEndpoint";
import type { FetchLike } from "./openaiClient";
import { compositeScore, latencyP50, renderReport } from "./report";
import { scoreChat } from "./scoreChat";
import { EXTRACTOR_RESERVE_TOKENS, scoreExtractor } from "./scoreExtractor";
import { SUITE } from "./suite";
import type { ModelResult, ModelSpec } from "./types";

const BENCH_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// Pinned for deterministic dasha relativization in sanitizeChartForLlm. The
// chart fixtures were generated 2026-07-02; keep `now` near that date so the
// engine's `current_*` fields and the sanitized "years remaining" agree.
const PINNED_NOW = new Date("2026-07-02T00:00:00Z");

const EN_FIXTURE = "chart-bengaluru-1988.json";
const ES_PT_FIXTURE = "chart-saopaulo-1995.json";

function loadChart(name: string): SiderealChart {
  const raw = readFileSync(join(BENCH_DIR, "fixtures", name), "utf8");
  return JSON.parse(raw) as SiderealChart;
}

function makeConfig(spec: ModelSpec, apiKey: string | undefined): ProviderConfig {
  return {
    engine: "openai-http",
    model: spec.slug,
    privacyMode: "cloud_premium",
    baseUrl: spec.baseUrl,
    ...(apiKey !== undefined ? { apiKey } : {}),
  };
}

async function runModel(
  spec: ModelSpec,
  fetchBase: FetchLike,
  apiKey: string | undefined,
  args: CliArgs,
): Promise<ModelResult> {
  console.log(`\n=== ${spec.slug} @ ${spec.baseUrl}`);
  let spent = 0;
  const trySpendTokens = (tokens: number): boolean => {
    if (spent + tokens > args.spendCap) return false;
    spent += tokens;
    return true;
  };

  try {
    // The SAME reservation-based cap governs both tasks: the extractor
    // reserves EXTRACTOR_RESERVE_TOKENS per attempt, chat reserves maxTokens
    // per question — exhaustion skips explicitly instead of overspending.
    const extractor = await scoreExtractor({
      config: makeConfig(spec, apiKey),
      stories: STORIES,
      fetchBase,
      trySpendTokens,
    });
    console.log(
      `  extractor: ${extractor.matched}/${extractor.expectedTotal} matched, ` +
        `${extractor.jsonValidFirstTry}/${extractor.stories} JSON-valid first try, ${extractor.retries} retries`,
    );

    const enChart = loadChart(EN_FIXTURE);
    const esPtChart = loadChart(ES_PT_FIXTURE);
    const enScore = await scoreChat({
      model: spec.slug,
      baseUrl: spec.baseUrl,
      chart: enChart,
      truth: buildEngineTruth(enChart),
      questions: EN_QUESTIONS,
      fetchBase,
      now: PINNED_NOW,
      maxTokens: args.maxTokens,
      trySpendTokens,
      ...(apiKey !== undefined ? { apiKey } : {}),
    });
    const esPtScore = await scoreChat({
      model: spec.slug,
      baseUrl: spec.baseUrl,
      chart: esPtChart,
      truth: buildEngineTruth(esPtChart),
      questions: [...ES_QUESTIONS, ...PT_QUESTIONS],
      fetchBase,
      now: PINNED_NOW,
      maxTokens: args.maxTokens,
      trySpendTokens,
      ...(apiKey !== undefined ? { apiKey } : {}),
    });

    const chat = {
      questions: enScore.questions + esPtScore.questions,
      failures: [...enScore.failures, ...esPtScore.failures],
      completionTokens: enScore.completionTokens + esPtScore.completionTokens,
      violations: [...enScore.violations, ...esPtScore.violations],
      violationsPer1k: 0,
      latenciesMs: [...enScore.latenciesMs, ...esPtScore.latenciesMs],
      thinkBlocksSeen: enScore.thinkBlocksSeen + esPtScore.thinkBlocksSeen,
      inLanguage: esPtScore.inLanguage,
    };
    chat.violationsPer1k =
      chat.completionTokens === 0 ? 0 : (chat.violations.length / chat.completionTokens) * 1000;
    console.log(
      `  chat: ${chat.violations.length} violations in ${chat.completionTokens} tokens ` +
        `(${chat.violationsPer1k.toFixed(2)}/1k), es ${chat.inLanguage.es.ok}/${chat.inLanguage.es.total}, ` +
        `pt ${chat.inLanguage.pt.ok}/${chat.inLanguage.pt.total}`,
    );

    const result: ModelResult = {
      spec,
      ok: true,
      extractor,
      chat,
      latencyP50Ms: latencyP50({ extractor, chat }),
      spendTokensEstimate: spent,
      composite: compositeScore({ extractor, chat }),
    };
    return result;
  } catch (err) {
    // Graceful per-model failure: a 404/timeout must not kill the suite.
    console.log(`  FAILED: ${String(err)}`);
    return {
      spec,
      ok: false,
      error: String(err).slice(0, 200),
      latencyP50Ms: null,
      spendTokensEstimate: spent,
      composite: 0,
    };
  }
}

/** Suite runner with bounded concurrency (≤2, per D4 cost etiquette). */
async function runPool(
  specs: readonly ModelSpec[],
  worker: (spec: ModelSpec) => Promise<ModelResult>,
  concurrency: number,
): Promise<ModelResult[]> {
  const results: ModelResult[] = new Array<ModelResult>(specs.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, specs.length) }, async () => {
    while (next < specs.length) {
      const i = next++;
      results[i] = await worker(specs[i]);
    }
  });
  await Promise.all(lanes);
  return results;
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliArgError) {
      console.error(err.message);
      process.exit(2);
    }
    throw err;
  }

  let specs: readonly ModelSpec[];
  if (args.suite || args.dryRun) {
    // Dry-run default: two OpenRouter slugs + a Qwen3 slug so the /no_think +
    // think-strip path is exercised against the mock.
    specs = args.dryRun && !args.suite ? [SUITE[0], SUITE[2], SUITE[5]] : SUITE;
    if (args.models) {
      specs = specs.filter((s) => args.models!.includes(s.slug));
      if (specs.length === 0) {
        console.log(`--models matched nothing in the suite: ${args.models.join(", ")}`);
        process.exit(2);
      }
    }
  } else if (args.model) {
    specs = [{ slug: args.model, baseUrl: args.base, keyEnv: args.keyEnv }];
  } else {
    console.log(
      "usage: bun bench/src/run.ts --base <url> --model <slug> [--key-env ENV]\n" +
        "       bun bench/src/run.ts --suite | --dry-run [--models a,b] [--max-tokens N] [--spend-cap N]",
    );
    process.exit(2);
  }

  // Cost estimate up front — printed, never silent.
  const perModelEstimate =
    STORIES.length * EXTRACTOR_RESERVE_TOKENS +
    (EN_QUESTIONS.length + ES_QUESTIONS.length + PT_QUESTIONS.length) * args.maxTokens;
  console.log(
    `Models: ${specs.length}. Estimated completion-token spend: ~${perModelEstimate} per model ` +
      `(~${perModelEstimate * specs.length} total), cap ${args.spendCap}/model. Concurrency ≤ 2.`,
  );
  if (args.dryRun) {
    console.log("DRY RUN: mocked endpoint, no network calls, no keys used.");
  }

  const results = await runPool(
    specs,
    async (spec) => {
      if (args.dryRun) {
        // Fresh mock per model: deterministic retry accounting regardless of
        // suite concurrency ordering.
        return runModel(spec, createMockFetch(), undefined, args);
      }
      const key = process.env[spec.keyEnv];
      if (!key) {
        console.log(`\n=== ${spec.slug}: SKIPPED (env ${spec.keyEnv} not set)`);
        return {
          spec,
          ok: false,
          skipped: `env ${spec.keyEnv} not set`,
          latencyP50Ms: null,
          spendTokensEstimate: 0,
          composite: 0,
        };
      }
      return runModel(spec, fetch, key, args);
    },
    2,
  );

  const report = renderReport(results, {
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? "dry-run (mocked endpoint)" : args.suite ? "suite" : "single model",
    fixtureIds: [EN_FIXTURE, ES_PT_FIXTURE],
    pinnedNow: PINNED_NOW.toISOString(),
    spendCapPerModel: args.spendCap,
  });

  const outDir = join(BENCH_DIR, "results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `${stamp}.md`);
  writeFileSync(outPath, report);
  console.log(`\nReport written: ${outPath}`);
}

void main();
