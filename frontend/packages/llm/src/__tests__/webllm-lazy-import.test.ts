// The LAZY-LOAD invariant, enforced at the source level: `@mlc-ai/web-llm`
// must NEVER be statically imported anywhere in the package's eager module
// graph — only `src/webllm/engine.ts` may reference it, and only via a dynamic
// `import()`. This is what keeps the multi-MB library out of every chunk a
// non-on-device user ever downloads.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRYPOINT = resolve(SRC_DIR, "index.ts");
const WEBLLM_SPEC = "@mlc-ai/web-llm";
const ALLOWED_DYNAMIC_IMPORTER = resolve(SRC_DIR, "webllm/engine.ts");

/** Strip comments so a specifier inside a comment can't create false hits. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** All static (value) import/re-export specifiers of a module's source. */
function staticImportSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const specs: string[] = [];
  // import ... from "x"  |  import "x"  — but NOT `import type` and NOT `import(`.
  const importRe = /import\s+(?!type\b)[^;'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
  // export { x } from "x" | export * from "x" — but NOT `export type`.
  const exportRe = /export\s+(?!type\b)(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g;
  for (const match of code.matchAll(importRe)) {
    specs.push(match[1] ?? match[2]);
  }
  for (const match of code.matchAll(exportRe)) {
    specs.push(match[1]);
  }
  return specs;
}

/** Resolve a relative specifier to a source file within src/. */
function resolveRelative(fromFile: string, spec: string): string | undefined {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    if (candidate.endsWith(".ts") || candidate.endsWith(".tsx")) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/** BFS the static value-import graph starting at the package entrypoint. */
function staticModuleGraph(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (graph.has(file)) {
      continue;
    }
    const specs = staticImportSpecifiers(readFileSync(file, "utf8"));
    graph.set(file, specs);
    for (const spec of specs) {
      if (spec.startsWith(".")) {
        const resolved = resolveRelative(file, spec);
        if (resolved) {
          queue.push(resolved);
        }
      }
    }
  }
  return graph;
}

describe("lazy-import invariant — @mlc-ai/web-llm stays out of the eager graph", () => {
  const graph = staticModuleGraph(ENTRYPOINT);

  it("the entrypoint's static module graph reaches the webllm module (routing is wired)", () => {
    expect([...graph.keys()]).toContain(ALLOWED_DYNAMIC_IMPORTER);
  });

  it("NO module in the eager graph statically imports @mlc-ai/web-llm", () => {
    const offenders = [...graph.entries()]
      .filter(([, specs]) => specs.includes(WEBLLM_SPEC))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("only engine.ts references the library at all, and only via dynamic import()", () => {
    for (const file of graph.keys()) {
      const code = stripComments(readFileSync(file, "utf8"));
      if (!code.includes(WEBLLM_SPEC)) {
        continue;
      }
      expect(file).toBe(ALLOWED_DYNAMIC_IMPORTER);
      // Every reference must be a dynamic import("...") expression.
      const references = [...code.matchAll(/["']@mlc-ai\/web-llm["']/g)];
      const dynamicRefs = [...code.matchAll(/import\(\s*["']@mlc-ai\/web-llm["']\s*\)/g)];
      expect(references.length).toBeGreaterThan(0);
      expect(dynamicRefs.length).toBe(references.length);
    }
  });
});
