// CLI argument parsing + validation for the bench runner. Extracted from
// run.ts so it is unit-testable (run.ts executes main() on import).
//
// Numeric flags are validated LOUDLY: a silent NaN --spend-cap would disable
// the cost guard, and a NaN --max-tokens would poison the request payloads.

import { OPENROUTER_API_BASE } from "../../src/config";

export interface CliArgs {
  readonly base: string;
  readonly model: string | null;
  readonly keyEnv: string;
  readonly suite: boolean;
  readonly dryRun: boolean;
  readonly maxTokens: number;
  readonly spendCap: number;
  /** Comma-separated slug filter applied to the suite (subset smoke runs). */
  readonly models: readonly string[] | null;
}

/** Thrown for invalid CLI input; run.ts maps it to usage + exit(2). */
export class CliArgError extends Error {}

function positiveInt(flag: string, raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new CliArgError(`${flag} expects a positive integer, got "${raw}"`);
  }
  return n;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  return {
    base: get("--base") ?? OPENROUTER_API_BASE,
    model: get("--model"),
    keyEnv: get("--key-env") ?? "OPENROUTER_API_KEY",
    suite: argv.includes("--suite"),
    dryRun: argv.includes("--dry-run"),
    maxTokens: positiveInt("--max-tokens", get("--max-tokens"), 450),
    spendCap: positiveInt("--spend-cap", get("--spend-cap"), 30_000),
    models: get("--models")?.split(",").map((s) => s.trim()) ?? null,
  };
}
