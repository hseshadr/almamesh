import { describe, expect, mock, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const centralSha = "8d9e0c04fcc4093947024d0bdfad2cd9a233b43c"
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

  test("keeps the shared Foundation guard as the only secret scanner", () => {
    expect(existsSync(resolve(root, "dagger/scripts/secret-scan.sh"))).toBe(false)
  })
})

describe("Foundation guard composition", () => {
  test("binds the exact source identity and propagates a guard failure", async () => {
    const source = { identity: "workspace-source", file: () => ({}) }
    const commitSha = "1".repeat(40)
    const guardFailure = new Error("central guard rejected source")
    const guardCalls: unknown[] = []
    const orchestration: string[] = []
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
            orchestration.push("foundation")
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
    Object.assign(module, {
      contracts: () => ({
        sync: async () => {
          orchestration.push("contracts")
        },
      }),
    })
    for (const gate of ["backend", "frontend", "browser", "pdf", "privacy"] as const) {
      module[gate] = (() => ({
        sync: async () => {
          productGates.push(gate)
        },
      })) as never
    }

    await expect(module.ci(commitSha)).rejects.toBe(guardFailure)
    expect(orchestration).toEqual(["contracts", "foundation"])
    expect(guardCalls).toEqual([{ source, repository, commitSha }])
    expect(productGates).toEqual([])
  })
})
