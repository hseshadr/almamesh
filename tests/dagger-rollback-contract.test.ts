import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import {
  RollbackRefused,
  pagesReadProgram,
  pagesRollbackProgram,
  parsePagesListing,
  planRollback,
  productionBaseline,
  requireRolledBack,
  type PagesDeployment,
  type PagesListing,
} from "../dagger/src/pagesRollback.ts"

const root = resolve(import.meta.dir, "..")
const OURS = "22222222-2222-4222-8222-222222222222"
const BEFORE = "11111111-1111-4111-8111-111111111111"
const OLDER = "00000000-0000-4000-8000-000000000000"

function deployment(id: string, createdOn: string, overrides: Partial<PagesDeployment> = {}): PagesDeployment {
  return {
    id,
    url: `https://${id.slice(0, 8)}.almamesh.pages.dev`,
    environment: "production",
    createdOn,
    stage: "deploy",
    status: "success",
    ...overrides,
  }
}

const older = deployment(OLDER, "2026-09-20T10:00:00Z")
const before = deployment(BEFORE, "2026-09-24T10:00:00Z")
const ours = deployment(OURS, "2026-09-25T10:00:00Z")

function listing(canonical: PagesDeployment, deployments: PagesDeployment[]): PagesListing {
  return { canonical, deployments }
}

function rawDeployment(value: PagesDeployment): Record<string, unknown> {
  return {
    id: value.id,
    url: value.url,
    environment: value.environment,
    created_on: value.createdOn,
    latest_stage: { name: value.stage, status: value.status },
  }
}

function serialized(canonical: PagesDeployment, deployments: PagesDeployment[]): string {
  return JSON.stringify({ canonical: rawDeployment(canonical), deployments: deployments.map(rawDeployment) })
}

function refusal(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(RollbackRefused)
    return (error as Error).message
  }
  throw new Error("expected a rollback refusal")
}

describe("Pages listing parser", () => {
  test("keeps only the typed fields of the live and production deployments", () => {
    expect(parsePagesListing(serialized(before, [before, older]))).toEqual(listing(before, [before, older]))
  })

  test.each([
    ["not JSON", "{"],
    ["an array", "[]"],
    ["no canonical deployment", JSON.stringify({ deployments: [] })],
    ["deployments not an array", JSON.stringify({ canonical: rawDeployment(before), deployments: {} })],
    ["a deployment without an id", JSON.stringify({ canonical: { ...rawDeployment(before), id: "" }, deployments: [] })],
    ["a deployment without a stage", JSON.stringify({ canonical: { ...rawDeployment(before), latest_stage: null }, deployments: [] })],
  ])("refuses %s", (_name, value) => {
    expect(refusal(() => parsePagesListing(value))).toContain("Cloudflare Pages listing")
  })
})

describe("production baseline (the deployment live before this release)", () => {
  test("is the live production deployment when it deployed successfully", () => {
    expect(productionBaseline(listing(before, [before, older]))).toEqual(before)
  })

  test.each([
    ["a preview deployment", { environment: "preview" }],
    ["a failed deployment", { status: "failure" }],
    ["an unfinished deployment", { stage: "build" }],
    ["a URL outside the project's pages.dev", { url: "https://evil.example" }],
  ])("refuses %s as the baseline", (_name, override) => {
    const live = { ...before, ...override }
    expect(refusal(() => productionBaseline(listing(live, [live])))).toContain("baseline")
  })
})

describe("rollback decision", () => {
  test("rolls back from this release to the deployment that was live before it", () => {
    expect(planRollback(listing(ours, [ours, before, older]), before, OURS)).toEqual({ from: OURS, to: before })
  })

  test("does not pick the newest older deployment when a different one was live", () => {
    const skipped = deployment("33333333-3333-4333-8333-333333333333", "2026-09-24T12:00:00Z")
    expect(planRollback(listing(ours, [ours, skipped, before]), before, OURS).to.id).toBe(BEFORE)
  })

  test.each([
    ["an empty listing", listing(ours, []), "no production deployments"],
    ["a duplicated deployment id", listing(ours, [ours, before, before]), "ambiguous"],
    ["a live deployment that is not this release", listing(before, [ours, before]), "not this release"],
    ["this release missing from the listing", listing(ours, [before]), "release is not listed"],
    ["the baseline missing from the listing", listing(ours, [ours, older]), "baseline is not listed"],
    [
      "a baseline that no longer deployed successfully",
      listing(ours, [ours, { ...before, status: "failure" }]),
      "baseline did not deploy successfully",
    ],
    [
      "a baseline created after this release",
      listing(ours, [ours, { ...before, createdOn: "2026-09-26T10:00:00Z" }]),
      "not older",
    ],
    [
      "an unparseable creation time",
      listing(ours, [{ ...ours, createdOn: "yesterday" }, before]),
      "timestamps",
    ],
  ])("refuses %s", (_name, value, reason) => {
    expect(refusal(() => planRollback(value, before, OURS))).toContain(reason)
  })

  test("refuses to roll back to this release itself", () => {
    expect(refusal(() => planRollback(listing(ours, [ours]), ours, OURS))).toContain("baseline is this release")
  })
})

describe("rollback confirmation", () => {
  test("accepts the baseline serving production again", () => {
    expect(() => requireRolledBack(listing(before, [ours, before]), { from: OURS, to: before })).not.toThrow()
  })

  test("refuses when production still serves another deployment", () => {
    expect(refusal(() => requireRolledBack(listing(ours, [ours, before]), { from: OURS, to: before })))
      .toContain("still serves")
  })
})

describe("Cloudflare Pages programs", () => {
  test("read only the project and its production deployments with a bounded, typed request", () => {
    const program = pagesReadProgram()
    expect(program).toContain('"/deployments?env=production"')
    expect(program).toContain('method: "GET"')
    expect(program).not.toContain('method: "POST"')
    expect(program).toContain("AbortSignal.timeout(20000)")
    expect(program).toContain('redirect: "error"')
    expect(program).toContain("process.env.CLOUDFLARE_API_TOKEN")
  })

  test("the rollback program posts exactly one validated deployment id", () => {
    const program = pagesRollbackProgram()
    expect(program).toContain('method: "POST"')
    expect(program).toContain('"/deployments/" + target + "/rollback"')
    expect(program).toContain("/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/")
    expect(program).toContain("process.env.ROLLBACK_TARGET")
  })

  test("only the rollback seam talks to the Cloudflare API or reads its token", () => {
    const sources = readdirSync(resolve(root, "dagger/src")).filter((name) => name.endsWith(".ts"))
    const talking = sources.filter((name) => {
      const source = readFileSync(resolve(root, "dagger/src", name), "utf8")
      return source.includes("api.cloudflare.com") || source.includes("process.env.CLOUDFLARE_API_TOKEN")
    })
    expect(talking).toEqual(["pagesRollback.ts"])
  })
})
