import { describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const root = resolve(import.meta.dir, "..")
const centralSha = "26bebf5e59ba2e819632ee3f3e3cbcf314d3c1a7"
const repository = "hseshadr/almamesh"

describe("central Dagger Lego pins", () => {
  test("pins Foundation and Cloudflare Pages to one exact central commit", () => {
    const descriptor = JSON.parse(
      readFileSync(resolve(root, "dagger.json"), "utf8"),
    ) as { dependencies?: Array<Record<string, string>> }

    expect(descriptor.dependencies).toEqual([
      {
        name: "cloudflare-pages",
        source: `github.com/hseshadr/ci/modules/cloudflare-pages@${centralSha}`,
        pin: centralSha,
      },
      {
        name: "foundation",
        source: `github.com/hseshadr/ci/modules/portfolio-foundation@${centralSha}`,
        pin: centralSha,
      },
    ])
  })
})

describe("Foundation Gitleaks policy", () => {
  test("the full repository history has no unapproved finding", () => {
    const run = spawnSync(
      "gitleaks",
      [
        "git",
        ".",
        "--config",
        ".gitleaks.toml",
        "--redact",
        "--no-banner",
        "--no-color",
      ],
      { cwd: root, encoding: "utf8" },
    )

    expect(run.status, run.stderr).toBe(0)
  }, 30_000)

  test("the historical fixture exception cannot allow the same pattern in a snapshot", () => {
    const sandbox = mkdtempSync(`${tmpdir()}/almamesh-gitleaks-snapshot-`)
    const fixtureSeed = [
      "616c6d616d6573682d7061726974792d",
      "666978747572652d7369676e65723030",
    ].join("")
    const fixtureDirectory = resolve(sandbox, "backend/tests")
    mkdirSync(fixtureDirectory, { recursive: true })
    writeFileSync(
      resolve(fixtureDirectory, "test_predictive_golden.py"),
      `FIXTURE_KEY_SEED_HEX = "${fixtureSeed}"\n`,
    )

    try {
      const run = spawnSync(
        "gitleaks",
        [
          "dir",
          sandbox,
          "--config",
          resolve(root, ".gitleaks.toml"),
          "--redact",
          "--no-banner",
          "--no-color",
        ],
        { encoding: "utf8" },
      )
      expect(run.status).toBe(1)
      expect(run.stderr).toContain("leaks found: 1")
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })
})

describe("Foundation guard composition", () => {
  test("binds the exact source identity and propagates a guard failure", async () => {
    const source = { identity: "workspace-source", file: () => ({}) }
    const commitSha = "1".repeat(40)
    const guardFailure = new Error("central guard rejected source")
    const guardCalls: unknown[] = []
    const productGates: string[] = []
    const foundationGate = new Proxy(
      {
        sync: async () => {
          throw guardFailure
        },
      },
      {
        get: (target, property) =>
          property in target
            ? target[property as keyof typeof target]
            : () => foundationGate,
      },
    )

    const legacyGate = new Proxy(
      { sync: async () => undefined },
      {
        get: (target, property) =>
          property in target
            ? target[property as keyof typeof target]
            : () => legacyGate,
      },
    )
    const noOpDecorator = () => () => undefined
    mock.module("@dagger.io/dagger", () => ({
      CacheVolume: class {},
      Container: class {},
      Directory: class {},
      Secret: class {},
      Service: class {},
      Workspace: class {},
      check: noOpDecorator,
      func: noOpDecorator,
      object: noOpDecorator,
      dag: {
        cacheVolume: () => ({}),
        container: () => legacyGate,
        foundation: () => ({
          guard: (guardSource: unknown, guardRepository: string, guardCommitSha: string) => {
            guardCalls.push({
              source: guardSource,
              repository: guardRepository,
              commitSha: guardCommitSha,
            })
            return foundationGate
          },
        }),
      },
    }))

    const { AlmameshCi } = await import("../dagger/src/index.ts")
    const module = new AlmameshCi({ directory: () => source } as never)
    for (const gate of ["backend", "frontend", "browser", "pdf", "privacy"] as const) {
      module[gate] = (() => ({
        sync: async () => {
          productGates.push(gate)
        },
      })) as never
    }

    await expect(module.ci(commitSha)).rejects.toBe(guardFailure)
    expect(guardCalls).toEqual([{ source, repository, commitSha }])
    expect(productGates).toEqual([])
  })
})
