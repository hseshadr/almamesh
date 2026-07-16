import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "bun:test";

const script = readFileSync(resolve(import.meta.dir, "setup-dev-assets.sh"), "utf8");

describe("setup-dev-assets network contracts", () => {
  it("retries every required Pyodide CDN download after transient failures", () => {
    const pyodideSection = script.split("# Ephemeris + IERS", 1)[0];
    const downloads = pyodideSection.match(/curl -fsSL[^\n]+/g) ?? [];

    expect(downloads).not.toHaveLength(0);
    expect(pyodideSection).toContain("--retry-all-errors");
    expect(pyodideSection).toContain("--retry-max-time 900");
  });

  it("publishes a Pyodide file only after its download completes", () => {
    expect(script).toContain('if [[ ! -s "${dest}" ]]');
    expect(script).toContain(".part.$$");
    expect(script).toContain("mv \"${part}\" \"${dest}\"");
  });

  it("uses the pinned npm runtime before reaching for a CDN copy", () => {
    expect(script).toContain('PYODIDE_NPM_DIR="${REPO_ROOT}/frontend/packages/browser/node_modules/pyodide"');
    expect(script).toContain('if [[ -f "${PYODIDE_NPM_DIR}/${f}" ]]; then');
    expect(script).toContain('cp "${PYODIDE_NPM_DIR}/${f}" "${part}"');
  });
});
