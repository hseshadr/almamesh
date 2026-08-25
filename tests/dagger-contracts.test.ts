import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
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

  test("production deploy verifies Cloudflare's recorded source identity", () => {
    const source = readFileSync(resolve(root, "dagger/src/index.ts"), "utf8")
    expect(source).toContain("verify-pages-source.mjs")
    expect(source).not.toContain("pages deployment list")
  })

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
})

describe("canonical GitHub ingress contract", () => {
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
