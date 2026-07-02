// Markdown report renderer: the ranked table used to re-rank
// BLESSED_ONDEVICE_MODELS, plus honest caveats and per-model evidence.

import type { ModelResult } from "./types";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function latencyP50(result: {
  extractor?: { latenciesMs: readonly number[] };
  chat?: { latenciesMs: readonly number[] };
}): number | null {
  return median([
    ...(result.extractor?.latenciesMs ?? []),
    ...(result.chat?.latenciesMs ?? []),
  ]);
}

/**
 * Composite score (documented in the report): extraction accuracy 40%,
 * fence cleanliness 40% (linear down to 0 at 10 violations/1k tokens),
 * JSON validity 10%, es/pt in-language 10%.
 */
export function compositeScore(result: {
  extractor?: { accuracy: number; jsonValidFirstTry: number; stories: number };
  chat?: {
    violationsPer1k: number;
    inLanguage: Readonly<Record<"es" | "pt", { ok: number; total: number }>>;
  };
}): number {
  const extraction = result.extractor?.accuracy ?? 0;
  const fence = result.chat ? Math.max(0, 1 - result.chat.violationsPer1k / 10) : 0;
  const jsonValidity =
    result.extractor && result.extractor.stories > 0
      ? result.extractor.jsonValidFirstTry / result.extractor.stories
      : 0;
  const langTotals = result.chat
    ? result.chat.inLanguage.es.total + result.chat.inLanguage.pt.total
    : 0;
  const langOk = result.chat
    ? result.chat.inLanguage.es.ok + result.chat.inLanguage.pt.ok
    : 0;
  const inLanguage = langTotals > 0 ? langOk / langTotals : 0;
  return extraction * 0.4 + fence * 0.4 + jsonValidity * 0.1 + inLanguage * 0.1;
}

export interface ReportMeta {
  readonly generatedAt: string;
  readonly mode: string;
  readonly fixtureIds: readonly string[];
  readonly pinnedNow: string;
  readonly spendCapPerModel: number;
}

export function renderReport(results: readonly ModelResult[], meta: ReportMeta): string {
  const ranked = [...results].sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    return b.composite - a.composite;
  });

  const lines: string[] = [
    "# Fence-violation benchmark — candidate on-device models",
    "",
    `- Generated: ${meta.generatedAt}`,
    `- Mode: ${meta.mode}`,
    `- Chart fixtures (synthetic natives): ${meta.fixtureIds.join(", ")}`,
    `- Pinned \`now\` for dasha relativization: ${meta.pinnedNow}`,
    `- Spend cap per model: ~${meta.spendCapPerModel} completion tokens`,
    "",
    "Composite = extraction accuracy ×0.4 + fence cleanliness ×0.4 (1 − violations/1k ÷ 10, floored at 0) + JSON validity ×0.1 + es/pt in-language ×0.1.",
    "",
    "| Rank | Model | Endpoint | Extraction acc | JSON valid (1st try) | Retries | Fence viol/1k tok | es/pt in-lang | Latency p50 | Think blocks | Composite | Notes |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];

  ranked.forEach((r, i) => {
    if (!r.ok) {
      lines.push(
        `| — | \`${r.spec.slug}\` | ${r.spec.baseUrl} | — | — | — | — | — | — | — | ${r.skipped ?? r.error ?? "failed"} |`,
      );
      return;
    }
    const ex = r.extractor;
    const ch = r.chat;
    const langCells: string[] = [];
    if (ch) {
      langCells.push(`es ${ch.inLanguage.es.ok}/${ch.inLanguage.es.total}`);
      langCells.push(`pt ${ch.inLanguage.pt.ok}/${ch.inLanguage.pt.total}`);
    }
    lines.push(
      [
        `| ${i + 1} `,
        `| \`${r.spec.slug}\` `,
        `| ${r.spec.baseUrl.includes("openrouter") ? "OpenRouter" : r.spec.baseUrl.includes("huggingface") ? "HF router" : r.spec.baseUrl} `,
        `| ${ex ? pct(ex.accuracy) + ` (${ex.matched}/${ex.expectedTotal}, ${ex.spurious} spurious)` : "—"} `,
        `| ${ex ? `${ex.jsonValidFirstTry}/${ex.stories}` : "—"} `,
        `| ${ex ? ex.retries : "—"} `,
        `| ${ch ? ch.violationsPer1k.toFixed(2) + ` (${ch.violations.length} in ${ch.completionTokens} tok)` : "—"} `,
        `| ${langCells.join(", ") || "—"} `,
        `| ${r.latencyP50Ms !== null ? `${r.latencyP50Ms} ms` : "—"} `,
        `| ${ch ? ch.thinkBlocksSeen : "—"} `,
        `| ${r.composite.toFixed(3)} `,
        `| ${r.spec.note ?? ""} |`,
      ].join(""),
    );
  });

  lines.push("", "## Violations (evidence)", "");
  for (const r of ranked) {
    if (!r.ok || !r.chat || r.chat.violations.length === 0) continue;
    lines.push(`### \`${r.spec.slug}\``, "");
    for (const v of r.chat.violations) {
      lines.push(`- **${v.kind}** — “${v.claim}” — ${v.detail}`);
    }
    lines.push("");
  }

  lines.push("## Failures / skips", "");
  let anyFailure = false;
  for (const r of ranked) {
    const notes = [
      ...(r.skipped ? [`skipped: ${r.skipped}`] : []),
      ...(r.error ? [`error: ${r.error}`] : []),
      ...(r.extractor?.failures ?? []),
      ...(r.chat?.failures ?? []),
    ];
    if (notes.length > 0) {
      anyFailure = true;
      lines.push(`- \`${r.spec.slug}\`: ${notes.join("; ")}`);
    }
  }
  if (!anyFailure) {
    lines.push("- none");
  }

  lines.push(
    "",
    "## Caveats (honest)",
    "",
    "- **Server quant ≠ browser quant.** These endpoints serve fp16/fp8/int8 server",
    "  builds; the browser runs q4f16_1 MLC artifacts. Numbers here are a screening",
    "  signal for RELATIVE ranking, not a browser-identical measurement. Final",
    "  confirmation needs the real WebLLM path on-device.",
    "- **OpenRouter proxies multiple providers** per slug; the provider actually",
    "  serving a request can vary between runs (temperature pinned at 0.2 to reduce",
    "  variance, but provider drift is real). The HF router likewise picks a backend.",
    "- **The fence checker is precision-first English-centric heuristics.** It",
    "  catches explicit lordship/dasha-date/dignity/yoga contradictions; it does NOT",
    "  catch paraphrased derivations, sign-rulership claims, es/pt lordship grammar,",
    "  or navamsa-context dignity talk (deliberately skipped to avoid false flags).",
    "  Violation counts are a floor, not a ceiling.",
    "- **Single sample per question** (cost guard); rates on ~7 questions are noisy.",
    "  Treat < 1 violation/1k-token differences as ties.",
    "- Qwen3 models are probed with `/no_think`; the `Think blocks` column reports",
    "  how often thinking mode leaked anyway (stripped before scoring).",
    "",
  );

  return lines.join("\n");
}
