import { pathToFileURL } from "node:url"

const API_ORIGIN = "https://api.cloudflare.com/client/v4"
const PROJECT = "almamesh"

export function deploymentMatches(deployment, expectedSha) {
  const metadata = deployment?.deployment_trigger?.metadata
  return (
    deployment?.environment === "production" &&
    deployment?.latest_stage?.status === "success" &&
    metadata?.branch === "main" &&
    metadata?.commit_hash === expectedSha
  )
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing required environment: ${name}`)
  return value
}

async function deployments(accountId, apiToken) {
  const url = new URL(
    `${API_ORIGIN}/accounts/${encodeURIComponent(accountId)}/pages/projects/${PROJECT}/deployments`,
  )
  url.searchParams.set("env", "production")
  url.searchParams.set("per_page", "25")
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  })
  if (!response.ok) throw new Error(`Cloudflare Pages API HTTP ${response.status}`)
  const value = await response.json()
  if (value?.success !== true || !Array.isArray(value.result)) {
    throw new Error("Cloudflare Pages API response invalid")
  }
  return value.result
}

function redactedMessage(error) {
  const message = error instanceof Error ? error.message : ""
  return /^Cloudflare Pages API (?:HTTP \d{3}|response invalid)$/.test(message)
    ? message
    : "Cloudflare Pages API request failed"
}

export async function verifyPagesSource({ accountId, apiToken, expectedSha }) {
  let lastError = "expected deployment not present"
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const rows = await deployments(accountId, apiToken)
      if (rows.some((deployment) => deploymentMatches(deployment, expectedSha))) {
        console.log(`Cloudflare Pages source identity verified: main ${expectedSha}`)
        return
      }
      lastError = "expected deployment not present"
    } catch (error) {
      lastError = redactedMessage(error)
    }
    if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
  throw new Error(`Cloudflare Pages source identity did not converge: ${lastError}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyPagesSource({
    accountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requiredEnv("CLOUDFLARE_API_TOKEN"),
    expectedSha: requiredEnv("EXPECTED_SHA"),
  }).catch((error) => {
    console.error(redactedMessage(error))
    process.exitCode = 1
  })
}
