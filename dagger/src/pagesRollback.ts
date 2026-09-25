/**
 * Cloudflare Pages rollback seam: the ONLY repository-authored code that talks
 * to the Cloudflare API (pinned by tests/dagger-rollback-contract.test.ts).
 *
 * The central `hseshadr/ci` cloudflare-pages module deploys but has no
 * rollback yet; this seam should graduate into that module. Until then it
 * holds (1) the pure decision — which deployment to restore, and every reason
 * to refuse — and (2) the two bounded programs the Dagger `deploy` function runs
 * with the same typed Cloudflare secrets it already receives.
 */

const PROJECT = "almamesh"
const PAGES_DEV_SUFFIX = `.${PROJECT}.pages.dev`

/** The fields of a Pages deployment the rollback decision needs. */
export interface PagesDeployment {
  id: string
  url: string
  environment: string
  createdOn: string
  stage: string
  status: string
}

/** The live production deployment plus the recent production deployments. */
export interface PagesListing {
  canonical: PagesDeployment
  deployments: readonly PagesDeployment[]
}

export interface RollbackPlan {
  from: string
  to: PagesDeployment
}

/** A rollback the seam will not perform; the message names the reason. */
export class RollbackRefused extends Error {
  constructor(reason: string) {
    super(`Automatic rollback refused: ${reason}`)
    this.name = "RollbackRefused"
  }
}

export function parsePagesListing(serialization: string): PagesListing {
  const value = parseRecord(serialization)
  if (!Array.isArray(value.deployments)) throw listingError()
  return {
    canonical: parseDeployment(value.canonical),
    deployments: value.deployments.map(parseDeployment),
  }
}

/** The deployment serving production before this release: the rollback target. */
export function productionBaseline(listing: PagesListing): PagesDeployment {
  const live = listing.canonical
  if (!deployedToProduction(live)) {
    throw new RollbackRefused("the live baseline is not a successful production deployment")
  }
  if (!onProjectPagesDev(live.url)) throw new RollbackRefused("the live baseline URL is outside the project")
  return live
}

export function planRollback(
  listing: PagesListing,
  baseline: PagesDeployment,
  releasedId: string,
): RollbackPlan {
  const byId = indexDeployments(listing.deployments)
  if (listing.canonical.id !== releasedId) {
    throw new RollbackRefused("production now serves a deployment that is not this release")
  }
  if (baseline.id === releasedId) throw new RollbackRefused("the baseline is this release")
  const released = byId.get(releasedId)
  const target = byId.get(baseline.id)
  if (!released) throw new RollbackRefused("this release is not listed")
  if (!target) throw new RollbackRefused("the baseline is not listed")
  if (!deployedToProduction(target)) throw new RollbackRefused("the baseline did not deploy successfully")
  if (createdAt(target) >= createdAt(released)) throw new RollbackRefused("the baseline is not older than this release")
  return { from: releasedId, to: target }
}

export function requireRolledBack(listing: PagesListing, plan: RollbackPlan): void {
  if (listing.canonical.id !== plan.to.id) {
    throw new RollbackRefused(`production still serves ${listing.canonical.id}, not ${plan.to.id}`)
  }
}

/** GET the project (its live deployment) and the recent production deployments. */
export function pagesReadProgram(): string {
  return `${apiPrelude()}
const read = async (path) => {
  const response = await fetch(base + path, { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(20000) })
  const body = await response.json()
  if (!response.ok || body.success !== true) throw new Error("Cloudflare Pages read failed with status " + response.status)
  return body.result
}
const pick = (d) => d && ({ id: d.id, url: d.url, environment: d.environment, created_on: d.created_on, latest_stage: d.latest_stage && { name: d.latest_stage.name, status: d.latest_stage.status } })
const [project, deployments] = await Promise.all([read(""), read("/deployments?env=production")])
console.log(JSON.stringify({ canonical: pick(project.canonical_deployment), deployments: deployments.map(pick) }))`
}

/** POST one rollback to ROLLBACK_TARGET, a validated deployment id. */
export function pagesRollbackProgram(): string {
  return `${apiPrelude()}
const target = process.env.ROLLBACK_TARGET ?? ""
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target)) throw new Error("rollback target differs")
const response = await fetch(base + "/deployments/" + target + "/rollback", { method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(20000) })
const body = await response.json()
if (!response.ok || body.success !== true) throw new Error("Cloudflare Pages rollback failed with status " + response.status)
console.log("Cloudflare Pages rollback accepted for " + target)`
}

function apiPrelude(): string {
  return `const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? ""
const token = process.env.CLOUDFLARE_API_TOKEN ?? ""
if (!/^[0-9a-f]{32}$/.test(account) || token.length === 0) throw new Error("Cloudflare credentials differ")
const base = "https://api.cloudflare.com/client/v4/accounts/" + account + "/pages/projects/${PROJECT}"
const headers = { authorization: "Bearer " + token }`
}

function parseRecord(serialization: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(serialization)
  } catch {
    throw listingError()
  }
  if (!isRecord(value)) throw listingError()
  return value
}

function parseDeployment(value: unknown): PagesDeployment {
  if (!isRecord(value) || !isRecord(value.latest_stage)) throw listingError()
  const stage = value.latest_stage
  const fields = [value.id, value.url, value.environment, value.created_on, stage.name, stage.status]
  if (!fields.every((field) => typeof field === "string" && field.length > 0)) throw listingError()
  const [id, url, environment, createdOn, stageName, status] = fields as string[]
  return { id, url, environment, createdOn, stage: stageName, status }
}

function indexDeployments(deployments: readonly PagesDeployment[]): Map<string, PagesDeployment> {
  if (deployments.length === 0) throw new RollbackRefused("no production deployments are listed")
  const byId = new Map(deployments.map((deployment) => [deployment.id, deployment]))
  if (byId.size !== deployments.length) throw new RollbackRefused("the deployment listing is ambiguous")
  return byId
}

function deployedToProduction(deployment: PagesDeployment): boolean {
  return deployment.environment === "production"
    && deployment.stage === "deploy"
    && deployment.status === "success"
}

function onProjectPagesDev(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname.endsWith(PAGES_DEV_SUFFIX) && url.username === ""
  } catch {
    return false
  }
}

function createdAt(deployment: PagesDeployment): number {
  const time = Date.parse(deployment.createdOn)
  if (Number.isNaN(time)) throw new RollbackRefused("deployment timestamps are invalid")
  return time
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function listingError(): RollbackRefused {
  return new RollbackRefused("the Cloudflare Pages listing schema differs")
}
