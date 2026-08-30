import { describe, expect, test } from "bun:test"

const baseImage =
  "node:22.13.0-bookworm@sha256:fa54405993eaa6bab6b6e460f5f3e945a2e2f07942ba31c0e297a7d9c2041f62"
const sourcePath = "/run/secrets/source"
const cliPath = "/usr/local/bin/gh"
const preparedCliPath = "/opt/secret-relay/gh/bin/gh"
const destinations = [
  "BUNDLE_PRIVATE_KEY_B64",
  "BUNDLE_PUBLIC_KEY_B64",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
] as const
const downloadScript = `set -euo pipefail
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
const staticEnvironment = [
  ["GH_PROMPT_DISABLED", "1"],
  ["GH_NO_UPDATE_NOTIFIER", "1"],
  ["DO_NOT_TRACK", "1"],
  ["GH_CONFIG_DIR", "/run/gh-config"],
] as const

interface Event {
  containerId: number
  method: string
  arguments: readonly unknown[]
}

interface PreparedFile {
  containerId: number
  path: string
}

type Relay = (
  client: object,
  adminToken: object,
  sources: readonly [object, object, object, object],
  operationId: string,
) => Promise<string>

class RecordingContainer {
  constructor(
    private readonly containerId: number,
    private readonly events: Event[],
    private readonly failedContainer?: number,
  ) {}

  private record(method: string, ...args: unknown[]): this {
    this.events.push({ containerId: this.containerId, method, arguments: args })
    return this
  }

  from(image: string): this {
    return this.record("from", image)
  }

  withExec(args: string[]): this {
    return this.record("exec", args)
  }

  file(path: string): PreparedFile {
    this.record("file", path)
    return { containerId: this.containerId, path }
  }

  withFile(path: string, file: PreparedFile): this {
    return this.record("with-file", path, file)
  }

  withMountedSecret(path: string, secret: object): this {
    return this.record("mounted-secret", path, secret)
  }

  withSecretVariable(name: string, secret: object): this {
    return this.record("secret-variable", name, secret)
  }

  withEnvVariable(name: string, value: string): this {
    return this.record("environment", name, value)
  }

  async sync(): Promise<this> {
    this.record("sync")
    if (this.containerId === this.failedContainer) throw new Error("relay failed")
    return this
  }
}

class RecordingDag {
  readonly events: Event[] = []
  created = 0

  constructor(private readonly failedContainer?: number) {}

  container(): RecordingContainer {
    this.created += 1
    return new RecordingContainer(this.created, this.events, this.failedContainer)
  }
}

async function loadRelay(): Promise<Relay | null> {
  const module = await import("../dagger/src/secret-relay.ts").catch(() => null) as
    | { relayProductionSecrets?: Relay }
    | null
  return module?.relayProductionSecrets ?? null
}

function relayScript(destination: string): string {
  return [
    "set -euo pipefail",
    "umask 077",
    'mkdir -p "$GH_CONFIG_DIR"',
    `gh secret set ${destination} --repo hseshadr/almamesh --env production < ${sourcePath}`,
    "",
  ].join("\n")
}

function expectedRelayEvents(
  containerId: number,
  cli: PreparedFile,
  admin: object,
  source: object,
  destination: string,
  operationId = "run-123-1",
): Event[] {
  const environment = [...staticEnvironment, ["SECRET_RELAY_OPERATION_ID", operationId]]
    .map(([name, value]) => ({ containerId, method: "environment", arguments: [name, value] }))
  return [
    { containerId, method: "from", arguments: [baseImage] },
    { containerId, method: "with-file", arguments: [cliPath, cli] },
    { containerId, method: "mounted-secret", arguments: [sourcePath, source] },
    { containerId, method: "secret-variable", arguments: ["GH_TOKEN", admin] },
    ...environment,
    { containerId, method: "exec", arguments: [["bash", "-ceu", relayScript(destination)]] },
    { containerId, method: "sync", arguments: [] },
  ]
}

describe("temporary production secret relay", () => {
  test("relays only the fixed allowlist through four fresh sequential containers", async () => {
    const relay = await loadRelay()
    expect(relay).not.toBeNull()
    if (!relay) return
    const recorder = new RecordingDag()
    const admin = { label: "admin" }
    const sources = destinations.map((label) => ({ label })) as [object, object, object, object]

    const result = await relay(recorder, admin, sources, "run-123-1")

    expect(result).toBe("relayed 4 secrets to the production environment")
    expect(recorder.created).toBe(5)
    const cli = { containerId: 1, path: preparedCliPath }
    const expected: Event[] = [
      { containerId: 1, method: "from", arguments: [baseImage] },
      { containerId: 1, method: "exec", arguments: [["bash", "-ceu", downloadScript]] },
      { containerId: 1, method: "file", arguments: [preparedCliPath] },
    ]
    destinations.forEach((destination, index) => {
      expected.push(...expectedRelayEvents(index + 2, cli, admin, sources[index], destination))
    })
    expect(recorder.events).toEqual(expected)
  })

  test("keeps every secret out of normal environment, argv, and body flags", async () => {
    const relay = await loadRelay()
    expect(relay).not.toBeNull()
    if (!relay) return
    const recorder = new RecordingDag()
    const admin = { label: "admin" }
    const sources = destinations.map((label) => ({ label })) as [object, object, object, object]

    await relay(recorder, admin, sources, "run-123-1")

    const secretEvents = recorder.events.filter(({ method }) =>
      method === "mounted-secret" || method === "secret-variable")
    const normalEvents = recorder.events.filter(({ method }) =>
      method === "exec" || method === "environment")
    expect(secretEvents).toHaveLength(8)
    for (const secret of [admin, ...sources]) {
      expect(normalEvents.every((event) => !event.arguments.includes(secret))).toBe(true)
    }
    expect(normalEvents.every((event) => !JSON.stringify(event).includes("--body"))).toBe(true)
  })

  test("stops before creating another transaction when one destination fails", async () => {
    const relay = await loadRelay()
    expect(relay).not.toBeNull()
    if (!relay) return
    const recorder = new RecordingDag(3)
    const sources = destinations.map((label) => ({ label })) as [object, object, object, object]

    await expect(relay(recorder, { label: "admin" }, sources, "run-123-1"))
      .rejects.toThrow("relay failed")

    expect(recorder.created).toBe(3)
    expect(recorder.events.at(-1)).toEqual({ containerId: 3, method: "sync", arguments: [] })
  })
})
