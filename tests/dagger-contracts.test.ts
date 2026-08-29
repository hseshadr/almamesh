import { describe, expect, test } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const root = resolve(import.meta.dir, "..")
const ansi = /\x1b\[[0-9;]*m/g

function daggerFunctions(): string[] {
  const run = spawnSync("dagger", ["functions"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DAGGER_NO_NAG: "1" },
  })
  expect(run.status, run.stderr).toBe(0)
  return run.stdout
    .replaceAll(ansi, "")
    .split("\n")
    .map((line) => line.trim().split(/\s+/, 1)[0])
    .filter((name) => /^[a-z][a-z-]+$/.test(name) && name !== "name")
}

function daggerHelp(name: string): string {
  const run = spawnSync("dagger", ["call", name, "--help"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DAGGER_NO_NAG: "1" },
  })
  expect(run.status, run.stderr).toBe(0)
  return run.stdout.replaceAll(ansi, "")
}

function workflow(name: string): Record<string, unknown> {
  const source = readFileSync(resolve(root, ".github/workflows", name), "utf8")
  return Bun.YAML.parse(source) as Record<string, unknown>
}

function steps(name: string): Array<Record<string, unknown>> {
  const jobs = workflow(name).jobs as Record<string, { steps: Array<Record<string, unknown>> }>
  return Object.values(jobs).flatMap((job) => job.steps)
}

function workflowSource(name: string): string {
  return readFileSync(resolve(root, ".github/workflows", name), "utf8")
}

function workflowNames(): string[] {
  return readdirSync(resolve(root, ".github/workflows"))
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
}

const checkout = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
const daggerAction = "dagger/dagger-for-github@27b130bf0f79a7f6fbbbe0fbca6760dc9bb40a77"
const deployHelpProbe = {
  name: "Verify generated deploy CLI",
  shell: "bash",
  run: "set -o pipefail\ndagger call deploy --help | dagger/scripts/verify-deploy-help.sh\n",
}

function exactStep(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort())
}

function ingressViolations(
  name: string,
  ingressSteps: Array<Record<string, unknown>>,
): string[] {
  const daggerWorkflow = name === "dagger.yml"
  const expectedUses = daggerWorkflow
    ? [checkout, daggerAction, undefined]
    : [checkout, daggerAction]
  const violations: string[] = []

  if (ingressSteps.length !== expectedUses.length) violations.push("step-count")
  if (JSON.stringify(ingressSteps.map((step) => step.uses)) !== JSON.stringify(expectedUses)) {
    violations.push("step-order")
  }
  if (daggerWorkflow) {
    if (!ingressSteps[2] || !exactStep(ingressSteps[2], deployHelpProbe)) {
      violations.push("deploy-help-probe")
    }
    if (ingressSteps.slice(0, 2).some((step) => "run" in step)) violations.push("unexpected-run")
  } else if (ingressSteps.some((step) => "run" in step)) {
    violations.push("unexpected-run")
  }
  return violations
}

function expectThinDaggerIngress(name: string): void {
  expect(ingressViolations(name, steps(name))).toEqual([])
}

describe("Dagger public orchestration contract", () => {
  test("exposes every repository-authored CI/CD operation as a native function", () => {
    expect(daggerFunctions()).toEqual(
      expect.arrayContaining([
        "backend",
        "browser",
        "contracts",
        "dependency-audit",
        "deploy",
        "deploy-dry-run",
        "frontend",
        "nightly",
        "pdf",
        "privacy",
        "production-artifact",
        "secret-scan",
        "verify-live",
        "web",
      ]),
    )
  }, 30_000)

  test("the PR-safe deploy dry-run needs an identity but no secret", () => {
    const help = daggerHelp("deploy-dry-run")
    const args = help.split("ARGUMENTS", 2)[1]?.split('Use "dagger', 1)[0] ?? ""
    expect(help).toContain("--expected-sha")
    expect(args).not.toContain("Secret")
  }, 30_000)

  test("the canonical CI entrypoint requires an exact non-secret commit identity", () => {
    const help = daggerHelp("ci")
    const args = help.split("ARGUMENTS", 2)[1]?.split('Use "dagger', 1)[0] ?? ""
    expect(help).toContain("--commit-sha")
    expect(args).not.toContain("Secret")
  }, 30_000)

  test("the contract gate executes the pure Foundation and workflow adversaries", () => {
    const run = spawnSync("dagger", ["call", "contracts", "stdout"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DAGGER_NO_NAG: "1" },
      timeout: 120_000,
    })
    const output = `${run.stdout}\n${run.stderr}`
    expect(run.status, output).toBe(0)
    expect(output).toContain("dagger-deployment-contract.test.ts")
    expect(output).toContain("dagger-foundation-contract.test.ts")
    expect(output).toContain("dagger-workflow-contract.test.ts")
  }, 120_000)

  test("production deploy composes one central Pages Functions transaction", () => {
    const source = readFileSync(resolve(root, "dagger/src/index.ts"), "utf8")
    expect(source).toContain("deliverProduction")
    expect(source).toContain(".greenMain(")
    expect(source).toContain(".source(")
    expect(source).toContain(".guard(")
    expect(source).toContain(".envelope(")
    expect(source).toContain("{ pagesFunctions: request.pagesFunctions }")
    expect(source).toContain("loadCloudflarePagesDeploymentEvidenceFromID")
    expect(source).not.toContain(".preflight(")
    expect(source).not.toContain(".verifyEnvelope(")
    expect(source).not.toContain("dag.cloudflarePages().verify(")
    expect(source).not.toContain("verify-pages-source.mjs")
    expect(source).not.toContain("pagesDeployScript")
  })

  test("deploy dry-run serves the closed compiled feedback route without credentials", () => {
    const expectedSha = "1".repeat(40)
    const run = spawnSync(
      "dagger",
      ["call", "deploy-dry-run", `--expected-sha=${expectedSha}`, "stdout"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, DAGGER_NO_NAG: "1" },
        timeout: 180_000,
      },
    )
    const output = `${run.stdout}\n${run.stderr}`
    expect(run.status, output).toBe(0)
    expect(output).toContain(
      `Wrangler Pages Functions dry-run verified closed feedback route for ${expectedSha}`,
    )
    expect(output).not.toContain("api.cloudflare.com")
  }, 180_000)

  test("package installs cannot reuse partially downloaded Bun tarballs", () => {
    const source = readFileSync(resolve(root, "dagger/src/index.ts"), "utf8")
    expect(source).not.toContain('withMountedCache("/root/.bun/install/cache"')
  })

  test("Bun installs time out, clean ephemeral state, retry once, and fail closed", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "almamesh-bun-install-"))
    const installer = resolve(root, "dagger/scripts/install-bun.sh")
    const counter = join(sandbox, "attempts")
    const args = join(sandbox, "args")
    writeFileSync(join(sandbox, "timeout"), [
      "#!/bin/sh", "shift 3", '"$@" &', "pid=$!", '( sleep 1; kill "$pid" 2>/dev/null ) &',
      "watch=$!", 'wait "$pid"', "status=$?", 'kill "$watch" 2>/dev/null || true', "exit $status",
    ].join("\n"))
    writeFileSync(join(sandbox, "bun"), [
      "#!/bin/sh", "set -eu", `counter='${counter}'`, `args='${args}'`,
      'attempt=$(($(cat "$counter" 2>/dev/null || echo 0) + 1))', 'echo "$attempt" > "$counter"',
      'echo "$*" >> "$args"',
      'if [ "${FAKE_FAIL:-}" = always ]; then mkdir -p node_modules "$BUN_INSTALL_CACHE_DIR"; touch node_modules/final-partial "$BUN_INSTALL_CACHE_DIR/final-partial"; exit 9; fi',
      'if [ "$attempt" -eq 1 ]; then sleep 5; fi', "mkdir -p node_modules",
    ].join("\n"))
    chmodSync(join(sandbox, "timeout"), 0o755)
    chmodSync(join(sandbox, "bun"), 0o755)
    const env = {
      ...process.env,
      PATH: `${sandbox}:${process.env.PATH ?? ""}`,
      BUN_INSTALL_CACHE_DIR: join(sandbox, "cache"),
      BUN_INSTALL_TIMEOUT_SECONDS: "1",
    }
    try {
      const recovered = spawnSync("bash", [installer], { cwd: sandbox, env, encoding: "utf8" })
      expect(recovered.status, recovered.stderr).toBe(0)
      expect(readFileSync(counter, "utf8").trim()).toBe("2")
      expect(readFileSync(args, "utf8").trim().split("\n"))
        .toEqual(["install --frozen-lockfile", "install --frozen-lockfile"])
      const failed = spawnSync("bash", [installer], {
        cwd: sandbox, env: { ...env, FAKE_FAIL: "always" }, encoding: "utf8",
      })
      expect(failed.status).toBe(1)
      expect(failed.stderr).toContain("failed after 2 attempts")
      expect(existsSync(join(sandbox, "node_modules/final-partial"))).toBe(true)
      expect(existsSync(join(sandbox, "cache/final-partial"))).toBe(true)
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  }, 10_000)
})

describe("canonical GitHub ingress contract", () => {
  test("every workflow checkout prevents persisted GitHub credentials", () => {
    for (const name of workflowNames()) {
      for (const step of steps(name).filter((candidate) => candidate.uses === checkout)) {
        expect((step.with as Record<string, unknown> | undefined)?.["persist-credentials"])
          .toBe(false)
      }
    }
  })

  test("every repository-authored CI/CD workflow only checks out and invokes Dagger", () => {
    for (const name of [
      "dagger.yml",
      "security-audit.yml",
      "nightly-e2e.yml",
      "deploy.yml",
    ]) expectThinDaggerIngress(name)
  })

  test.each([
    {
      name: "extra step",
      mutate: (source: Array<Record<string, unknown>>) => [
        ...source,
        { run: "echo unexpected" },
      ],
    },
    {
      name: "wrong help command",
      mutate: (source: Array<Record<string, unknown>>) => source.map((step, index) =>
        index === 2 ? { ...step, run: "dagger call ci --help" } : step),
    },
    {
      name: "help probe before Dagger",
      mutate: (source: Array<Record<string, unknown>>) => [source[0], source[2], source[1]],
    },
  ])("rejects $name in the protected Dagger ingress", ({ mutate }) => {
    const mutant = mutate(structuredClone(steps("dagger.yml")))
    expect(ingressViolations("dagger.yml", mutant)).not.toEqual([])
  })

  test("the security audit invokes its native Dagger function", () => {
    expect(workflowSource("security-audit.yml")).toContain("args: dependency-audit")
  })

  test("Dagger is the only pull-request and push ingress", () => {
    const eventIngresses = workflowNames().filter((name) => {
      const source = workflowSource(name)
      return source.includes("  pull_request:\n") || source.includes("  push:\n")
    })
    expect(eventIngresses).toEqual(["dagger.yml"])
    expect(existsSync(resolve(root, ".github/workflows/test.yml"))).toBe(false)
  })

  test("nightly passes the optional OpenRouter key only as a typed secret provider", () => {
    const source = workflowSource("nightly-e2e.yml")
    expect(source).toContain("OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}")
    expect(source).toContain("--openrouter-api-key=env:OPENROUTER_API_KEY")
    expect(source).not.toContain("VITE_OPENROUTER")
  })

  test("production deployment binds the exact protected run through typed secrets", () => {
    const source = workflowSource("deploy.yml")
    expect(source).not.toContain("workflow_dispatch")
    expect(source).toContain("github.event.workflow_run.event == 'push'")
    expect(source).toContain("github.event.workflow_run.head_repository.full_name == github.repository")
    expect(source).toContain("ref: ${{ github.event.workflow_run.head_sha }}")
    expect(source).toContain("--expected-sha=${{ github.event.workflow_run.head_sha }}")
    expect(source).toContain("--workflow-run-id=${{ github.event.workflow_run.id }}")
    expect(source).toContain("--run-attempt=${{ github.event.workflow_run.run_attempt }}")
    expect(source).toContain("--github-token=env:GITHUB_TOKEN")
    expect(source).toContain("environment: production")
    expect(source).not.toMatch(/args:[\s\S]*\$\{\{ secrets\./)
  })

  test("shadow ingress is deleted only after its hosted checks are green", () => {
    expect(existsSync(resolve(root, ".github/workflows/dagger-shadow.yml"))).toBe(false)
    expect(existsSync(resolve(root, ".github/workflows/deploy-dagger-shadow.yml"))).toBe(false)
  })

  test("there is no repository-authored manual production deploy bypass", () => {
    expect(existsSync(resolve(root, "scripts/go-live-almamesh.sh"))).toBe(false)
    expect(workflowSource("deploy.yml")).not.toContain("workflow_dispatch")
  })
})
