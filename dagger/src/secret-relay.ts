import type { Container, File, Secret } from "@dagger.io/dagger"

const BASE_IMAGE =
  "node:22.13.0-bookworm@sha256:fa54405993eaa6bab6b6e460f5f3e945a2e2f07942ba31c0e297a7d9c2041f62"
const REPOSITORY = "hseshadr/almamesh"
const ENVIRONMENT = "production"
const SOURCE_PATH = "/run/secrets/source"
const CLI_PATH = "/usr/local/bin/gh"
const PREPARED_CLI_PATH = "/opt/secret-relay/gh/bin/gh"
const DOWNLOAD_SCRIPT = `set -euo pipefail
archive=/opt/secret-relay/gh.tar.gz
root=/opt/secret-relay/gh
mkdir -p "$root"
url='https://github.com/cli/cli/releases/download/'
url="${"$"}{url}v2.98.0/gh_2.98.0_linux_amd64.tar.gz"
digest='3b8ac6b30336802fc1a858d7c084e11cdf24ac1a761ca90b68022d7d729208de'
curl --fail --location --silent --show-error --output "$archive" "$url"
printf '%s  %s\\n' "$digest" "$archive" | sha256sum --check --status
tar --extract --gzip --file "$archive" --directory "$root" --strip-components=1
test -x "$root/bin/gh"
`
const STATIC_ENVIRONMENT = [
  ["GH_PROMPT_DISABLED", "1"],
  ["GH_NO_UPDATE_NOTIFIER", "1"],
  ["DO_NOT_TRACK", "1"],
  ["GH_CONFIG_DIR", "/run/gh-config"],
] as const
const DESTINATIONS = [
  "BUNDLE_PRIVATE_KEY_B64",
  "BUNDLE_PUBLIC_KEY_B64",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
] as const

type Destination = typeof DESTINATIONS[number]
type Sources = readonly [Secret, Secret, Secret, Secret]

interface RelayDag {
  container(): Container
}

function base(client: RelayDag): Container {
  return client.container().from(BASE_IMAGE)
}

function githubCli(client: RelayDag): File {
  return base(client).withExec(["bash", "-ceu", DOWNLOAD_SCRIPT]).file(PREPARED_CLI_PATH)
}

function relayScript(destination: Destination): string {
  return [
    "set -euo pipefail",
    "umask 077",
    'mkdir -p "$GH_CONFIG_DIR"',
    `gh secret set ${destination} --repo ${REPOSITORY} --env ${ENVIRONMENT} < ${SOURCE_PATH}`,
    "",
  ].join("\n")
}

function withEnvironment(container: Container, operationId: string): Container {
  let configured = container
  for (const [name, value] of [...STATIC_ENVIRONMENT, ["SECRET_RELAY_OPERATION_ID", operationId]] as const) {
    configured = configured.withEnvVariable(name, value)
  }
  return configured
}

function relayContainer(
  client: RelayDag,
  cli: File,
  adminToken: Secret,
  source: Secret,
  destination: Destination,
  operationId: string,
): Container {
  const container = base(client)
    .withFile(CLI_PATH, cli)
    .withMountedSecret(SOURCE_PATH, source)
    .withSecretVariable("GH_TOKEN", adminToken)
  return withEnvironment(container, operationId)
    .withExec(["bash", "-ceu", relayScript(destination)])
}

export async function relayProductionSecrets(
  client: RelayDag,
  adminToken: Secret,
  sources: Sources,
  operationId: string,
): Promise<string> {
  const cli = githubCli(client)
  for (const [index, destination] of DESTINATIONS.entries()) {
    await relayContainer(client, cli, adminToken, sources[index], destination, operationId).sync()
  }
  return "relayed 4 secrets to the production environment"
}
