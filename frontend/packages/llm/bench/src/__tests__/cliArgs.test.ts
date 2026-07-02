// CLI argument parsing + validation (extracted from run.ts so it is
// unit-testable; run.ts executes main() on import). Invalid numeric flags must
// fail LOUDLY — a silent NaN spend cap would disable the cost guard.

import { describe, expect, it } from "vitest";

import { CliArgError, parseArgs } from "../cliArgs";

describe("parseArgs", () => {
  it("applies the documented defaults", () => {
    const args = parseArgs([]);
    expect(args.maxTokens).toBe(450);
    expect(args.spendCap).toBe(30_000);
    expect(args.suite).toBe(false);
    expect(args.dryRun).toBe(false);
    expect(args.model).toBeNull();
    expect(args.models).toBeNull();
  });

  it("parses explicit numeric flags", () => {
    const args = parseArgs(["--max-tokens", "200", "--spend-cap", "5000"]);
    expect(args.maxTokens).toBe(200);
    expect(args.spendCap).toBe(5000);
  });

  it.each([
    ["--max-tokens", "abc"],
    ["--max-tokens", "-5"],
    ["--max-tokens", "0"],
    ["--max-tokens", "1.5"],
    ["--spend-cap", "notanumber"],
    ["--spend-cap", "-1"],
  ])("rejects %s %s with a clear error", (flag, value) => {
    expect(() => parseArgs([flag, value])).toThrow(CliArgError);
    expect(() => parseArgs([flag, value])).toThrow(new RegExp(`${flag}.*positive integer`));
  });

  it("rejects a numeric flag that swallowed the next flag as its value", () => {
    expect(() => parseArgs(["--max-tokens", "--suite"])).toThrow(CliArgError);
  });

  it("parses --models into trimmed slugs", () => {
    expect(parseArgs(["--models", "a, b"]).models).toEqual(["a", "b"]);
  });
});
