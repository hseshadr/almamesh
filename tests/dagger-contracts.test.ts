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
import { deploymentMatches } from "../dagger/scripts/verify-pages-source.mjs"

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

function daggerChecks(): string[] {
  const run = spawnSync("dagger", ["check", "--list", "--no-generate"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DAGGER_NO_NAG: "1" },
  })
  expect(run.status, run.stderr).toBe(0)
  return run.stdout
    .replaceAll(ansi, "")
    .split("\n")
    .map((line) => line.trim().split(/\s+/, 1)[0])
    .filter((name) => name.startsWith("almamesh-ci:"))
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

function expectThinDaggerIngress(name: string): void {
  const ingressSteps = steps(name)
  expect(ingressSteps.length).toBe(2)
  expect(ingressSteps.map((step) => step.uses)).toEqual([checkout, daggerAction])
  expect(ingressSteps.every((step) => !("run" in step))).toBe(true)
}

describe("Dagger public orchestration contract", () => {
  test("exposes every repository-authored CI/CD operation as a native function", () => {
    expect(daggerFunctions()).toEqual(
      expect.arrayContaining([
        "backend",
        "browser",
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

  test("the canonical check graph sequences heavy gates through one CI check", () => {
    expect(daggerChecks()).toEqual(["almamesh-ci:ci"])
    const source = workflowSource("dagger.yml")
    expect(source).toContain("args: ci")
    expect(source).not.toContain('args: "**"')
  }, 30_000)

  test("the canonical CI graph includes the repository secret scan", () => {
    const source = readFileSync(resolve(root, "dagger/src/index.ts"), "utf8")
    const ci = source.split("async ci(): Promise<string>", 2)[1]?.split("@func()", 1)[0] ?? ""
    expect(ci).toContain("this.secretScan()")
  })

  test("secret scan fails when a leak exists only in Git history", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "almamesh-history-scan-"))
    const repository = join(sandbox, "repository")
    const source = join(sandbox, "source")
    const fakeBin = join(sandbox, "bin")
    const marker = "ALMAMESH_REMOVED_HISTORY_MARKER"
    mkdirSync(repository)
    mkdirSync(source)
    mkdirSync(fakeBin)
    writeFileSync(join(source, ".gitleaks.toml"), 'title = "test"\n')
    writeFileSync(join(repository, "removed.txt"), `${marker}\n`)
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repository })
    spawnSync("git", ["config", "user.email", "ci@example.invalid"], { cwd: repository })
    spawnSync("git", ["config", "user.name", "CI"], { cwd: repository })
    spawnSync("git", ["add", "removed.txt"], { cwd: repository })
    spawnSync("git", ["commit", "-qm", "historical marker"], { cwd: repository })
    rmSync(join(repository, "removed.txt"))
    spawnSync("git", ["add", "-u"], { cwd: repository })
    spawnSync("git", ["commit", "-qm", "remove marker"], { cwd: repository })
    writeFileSync(
      join(fakeBin, "gitleaks"),
      [
        "#!/bin/sh",
        "set -eu",
        'if [ "$1" = dir ]; then exit 0; fi',
        'if git -C "$2" log -p --all | grep -q "$HISTORICAL_MARKER"; then',
        '  echo "historical secret detected" >&2',
        "  exit 42",
        "fi",
      ].join("\n"),
    )
    chmodSync(join(fakeBin, "gitleaks"), 0o755)
    try {
      const run = spawnSync("bash", [resolve(root, "dagger/scripts/secret-scan.sh")], {
        encoding: "utf8",
        env: {
          ...process.env,
          ALMAMESH_REPOSITORY_URL: `file://${repository}`,
          HISTORY_ROOT: join(sandbox, "history"),
          HISTORICAL_MARKER: marker,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          SOURCE_ROOT: source,
        },
      })
      expect(run.status, run.stderr).toBe(42)
      expect(run.stderr).toContain("historical secret detected")
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })

  test("production deploy verifies Cloudflare's recorded source identity", () => {
    const source = readFileSync(resolve(root, "dagger/src/index.ts"), "utf8")
    expect(source).toContain(
      'const PAGES_SOURCE_VERIFIER = "/opt/almamesh/verify-pages-source.mjs"',
    )
    expect(source).toContain("verify-pages-source.mjs")
    expect(source).not.toContain("node dagger/scripts/verify-pages-source.mjs")
    expect(source).not.toContain("pages deployment list")
  })

  test("deploy dry-run executes the production Pages verifier from the app workdir", () => {
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
    expect(output).toContain(`Cloudflare Pages source identity verified: main ${expectedSha}`)
  }, 180_000)

  test("Cloudflare source verification requires the full API commit identity", () => {
    const expectedSha = "b6cdd41e2ed2eef68af95d926270c5d31c1e80ab"
    const deployment = {
      environment: "production",
      latest_stage: { status: "success" },
      deployment_trigger: { metadata: { branch: "main", commit_hash: expectedSha } },
    }

    expect(deploymentMatches(deployment, expectedSha)).toBe(true)
    expect(deploymentMatches({ ...deployment, environment: "preview" }, expectedSha)).toBe(false)
    expect(
      deploymentMatches({ ...deployment, latest_stage: { status: "active" } }, expectedSha),
    ).toBe(false)
    expect(
      deploymentMatches(
        { ...deployment, deployment_trigger: { metadata: { branch: "preview", commit_hash: expectedSha } } },
        expectedSha,
      ),
    ).toBe(false)
    expect(deploymentMatches(deployment, "0".repeat(40))).toBe(false)
    expect(
      deploymentMatches(
        { Environment: "Production", Branch: "main", Source: expectedSha.slice(0, 7) },
        expectedSha,
      ),
    ).toBe(false)
  })

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
      "test.yml",
      "security-audit.yml",
      "nightly-e2e.yml",
      "deploy.yml",
    ]) expectThinDaggerIngress(name)
  })

  test("required checks invoke their native Dagger functions", () => {
    expect(workflowSource("dagger.yml")).toContain("verb: call")
    expect(workflowSource("dagger.yml")).toContain("args: ci")
    expect(workflowSource("dagger.yml")).not.toContain('args: "**"')
    expect(workflowSource("test.yml")).toContain("args: secret-scan sync")
    expect(workflowSource("security-audit.yml")).toContain("args: dependency-audit")
  })

  test("nightly passes the optional OpenRouter key only as a typed secret provider", () => {
    const source = workflowSource("nightly-e2e.yml")
    expect(source).toContain("OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}")
    expect(source).toContain("--openrouter-api-key=env:OPENROUTER_API_KEY")
    expect(source).not.toContain("VITE_OPENROUTER")
  })

  test("production deployment is privileged, same-SHA guarded, and has no manual bypass", () => {
    const source = workflowSource("deploy.yml")
    expect(source).not.toContain("workflow_dispatch")
    expect(source).toContain("github.event.workflow_run.event == 'push'")
    expect(source).toContain("github.event.workflow_run.head_repository.full_name == github.repository")
    expect(source).toContain("ref: ${{ github.event.workflow_run.head_sha }}")
    expect(source).toContain("--expected-sha=${{ github.event.workflow_run.head_sha }}")
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
