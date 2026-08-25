import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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

  test("the unprivileged shadow ingress can only checkout and invoke Dagger", () => {
    const source = workflowSource("dagger-shadow.yml")
    expect(source).not.toContain("secrets.")
    expect(steps("dagger-shadow.yml").every((step) => {
      const action = step.uses
      return typeof action === "string" &&
        (action.startsWith("actions/checkout@") || action.startsWith("dagger/dagger-for-github@"))
    })).toBe(true)
  })

  test("the deploy shadow has no manual trigger or repo-authored shell escape", () => {
    const source = workflowSource("deploy-dagger-shadow.yml")
    expect(source).not.toContain("workflow_dispatch")
    expect(steps("deploy-dagger-shadow.yml").every((step) => {
      const action = step.uses
      return typeof action === "string" &&
        (action.startsWith("actions/checkout@") || action.startsWith("dagger/dagger-for-github@"))
    })).toBe(true)
  })

  test("the canonical check graph sequences heavy gates through one CI check", () => {
    expect(daggerChecks()).toEqual(["almamesh-ci:ci"])
    const source = workflowSource("dagger-shadow.yml")
    expect(source).toContain("args: ci")
    expect(source).not.toContain('args: "**"')
  }, 30_000)

  test("production deploy verifies Cloudflare's recorded source identity", () => {
    const source = readFileSync(resolve(root, "dagger/src/index.ts"), "utf8")
    expect(source).toContain("pages deployment list")
    expect(source).toContain("deployment_trigger")
    expect(source).toContain('metadata.branch !== "main"')
    expect(source).toContain("metadata.commit_hash !== process.env.EXPECTED_SHA")
  })
})
