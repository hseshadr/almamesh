import {
  CacheVolume,
  Container,
  Directory,
  Secret,
  Service,
  Workspace,
  check,
  dag,
  func,
  object,
} from "@dagger.io/dagger"

const ROOT = "/workspace"
const FRONTEND = `${ROOT}/frontend`
const WEB = `${FRONTEND}/apps/web`
const DIST = `${WEB}/dist`
const KEYS = "/run/almamesh-keys"
const LIVE_ORIGIN = "https://almamesh.com"
const BUN_IMAGE =
  "oven/bun:1.3.5@sha256:e90cdbaf9ccdb3d4bd693aa335c3310a6004286a880f62f79b18f9b1312a8ec3"
const NODE_IMAGE =
  "node:22-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284"
const UV_IMAGE =
  "ghcr.io/astral-sh/uv:0.12.1-python3.13-trixie-slim@sha256:8db423175bfff42bd1c81f77280bc92f10ef9cf03161803bd5cb6e15d86c3d10"
const GITLEAKS_IMAGE =
  "zricethezav/gitleaks:v8.28.0@sha256:cdbb7c955abce02001a9f6c9f602fb195b7fadc1e812065883f695d1eeaba854"
const WRANGLER_VERSION = "4.103.0"
const WRANGLER = "/opt/wrangler/node_modules/.bin/wrangler"
const WRANGLER_COMPATIBILITY_DATE = "2026-06-24"
const SOURCE_EXCLUDES = [
  ".git/**",
  "**/.env",
  "**/.env.local",
  "**/.env.*.local",
  "**/*private*.key",
  "**/node_modules/**",
  "**/dist*/**",
  "**/.venv/**",
  "dagger/sdk/**",
]

@object()
export class AlmameshCi {
  source: Directory

  constructor(workspace: Workspace) {
    this.source = workspace.directory("/", {
      exclude: SOURCE_EXCLUDES,
      gitignore: false,
    })
  }

  private selected(include: string[]): Directory {
    return this.source.filter({ include, gitignore: false })
  }
  private cache(name: string): CacheVolume {
    return dag.cacheVolume(`almamesh-${name}`)
  }
  private bunBase(): Container {
    return dag
      .container()
      .from(BUN_IMAGE)
      .withDirectory(ROOT, this.selected([".gitignore", ".github/workflows/**", "CHANGELOG.md", "README.md", "SECURITY.md", "backend/**", "dagger/**", "docs/**", "frontend/**", "testdata/**"]))
      .withWorkdir(FRONTEND)
      .withEnvVariable("ALMAMESH_CI_CONTRACT", "modern-v13")
      .withEnvVariable("HUSKY", "0")
      .withNewFile("/tmp/node-contract.cjs", "Promise.withResolvers ||= () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail }); return { promise, resolve, reject } }")
      .withEnvVariable("NODE_OPTIONS", "--require=/tmp/node-contract.cjs")
      .withEnvVariable("PYTHON", "/usr/bin/python3")
      .withMountedCache("/root/.bun/install/cache", this.cache("bun"))
      .withExec([
        "sh",
        "-c",
        "apt-get update && apt-get install -y --no-install-recommends build-essential git node-gyp nodejs poppler-utils && rm -rf /var/lib/apt/lists/*",
      ])
      .withExec(["bun", "install", "--frozen-lockfile"])
      .withExec(["sh", "-c", `git -C ${ROOT} init && git -C ${ROOT} add -A`])
  }

  private uvBase(): Container {
    return dag
      .container()
      .from(UV_IMAGE)
      .withDirectory(
        ROOT,
        this.selected([
          ".github/workflows/deploy.yml",
          "backend/**",
          "frontend/packages/browser/src/pyodide/*.ts",
          "testdata/**",
        ]),
      )
      .withWorkdir(`${ROOT}/backend`)
      .withEnvVariable("UV_LINK_MODE", "copy")
      .withEnvVariable("UV_PROJECT_ENVIRONMENT", "/opt/venv")
      .withMountedCache("/root/.cache/uv", this.cache("uv"))
      .withExec(["uv", "sync", "--locked", "--extra", "dev"])
  }

  private releaseBase(): Container {
    const bun = dag.container().from(BUN_IMAGE).file("/usr/local/bin/bun")
    const uv = dag.container().from(UV_IMAGE).file("/usr/local/bin/uv")
    return dag
      .container()
      .from(NODE_IMAGE)
      .withFile("/usr/local/bin/bun", bun)
      .withFile("/usr/local/bin/uv", uv)
      .withFile("/usr/local/bin/uvx", uv)
      .withDirectory(ROOT, this.selected([".gitignore", "backend/**", "frontend/**"]))
      .withWorkdir(FRONTEND)
      .withEnvVariable("UV_LINK_MODE", "copy")
      .withEnvVariable("UV_PROJECT_ENVIRONMENT", "/opt/venv")
      .withEnvVariable("HUSKY", "0")
      .withEnvVariable("PYTHON", "/usr/bin/python3")
      .withEnvVariable("WRANGLER", WRANGLER)
      .withMountedCache("/root/.cache/uv", this.cache("uv"))
      .withMountedCache("/root/.bun/install/cache", this.cache("bun"))
      .withExec([
        "sh",
        "-c",
        "apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl git node-gyp openssl poppler-utils python3 python3-dev && rm -rf /var/lib/apt/lists/*",
      ])
      .withExec(["bun", "install", "--frozen-lockfile"])
      .withExec([
        "npm",
        "install",
        "--prefix",
        "/opt/wrangler",
        "--no-audit",
        "--no-fund",
        "--no-save",
        `wrangler@${WRANGLER_VERSION}`,
      ])
      .withExec(["bash", "apps/web/scripts/setup-dev-assets.sh"])
      .withWorkdir(WEB)
  }

  private browserBase(browsers: string[]): Container {
    const bun = dag.container().from(BUN_IMAGE).file("/usr/local/bin/bun")
    return dag
      .container()
      .from(UV_IMAGE)
      .withFile("/usr/local/bin/bun", bun)
      .withDirectory(ROOT, this.selected(["backend/**", "frontend/**"]))
      .withWorkdir(FRONTEND)
      .withEnvVariable("UV_LINK_MODE", "copy")
      .withEnvVariable("UV_PROJECT_ENVIRONMENT", "/opt/venv")
      .withEnvVariable("VITE_API_URL", "")
      .withEnvVariable("HUSKY", "0")
      .withEnvVariable("PYTHON", "/usr/bin/python3")
      .withMountedCache("/root/.cache/uv", this.cache("uv"))
      .withMountedCache("/root/.bun/install/cache", this.cache("bun"))
      .withMountedCache("/root/.skyfield-data", this.cache("skyfield"))
      .withExec([
        "sh",
        "-c",
        "apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl git node-gyp nodejs openssl poppler-utils && rm -rf /var/lib/apt/lists/*",
      ])
      .withExec(["bun", "install", "--frozen-lockfile"])
      .withExec(["bash", "apps/web/scripts/setup-dev-assets.sh"])
      .withWorkdir(WEB)
      .withExec(["bun", "x", "playwright", "install", "--with-deps", ...browsers])
  }

  private builtBrowser(
    output: string,
    hooks = false,
    browsers = ["chromium", "webkit"],
  ): Container {
    let container = this.browserBase(browsers)
    if (hooks) container = container.withEnvVariable("VITE_EXIT_GATE_HOOKS", "1")
    return container.withExec([
      "./node_modules/.bin/vite",
      "build",
      "--outDir",
      output,
    ])
  }

  @func()
  backend(): Container {
    return this.uvBase().withExec(["uv", "run", "poe", "gate"])
  }
  @func()
  frontend(): Container {
    return this.bunBase().withExec(["bun", "run", "gate"])
  }
  @func()
  browser(): Container {
    let checked = this.builtBrowser("dist-verify", true)
      .withExec(["node", "scripts/verify-precache-redirect.mjs", "dist-verify"])
    checked = this.localPreview(checked, "dist-verify", [
      "node scripts/verify-exit-gate.mjs http://127.0.0.1:4199",
      "node scripts/verify-i18n.mjs http://127.0.0.1:4199",
      "node scripts/verify-browser-parity.mjs http://127.0.0.1:4199 --reference-date=2025-01-01T00:00:00+00:00",
    ])
    checked = this.localServer(
      checked,
      "python3 -m http.server 4200 --directory dist-verify --bind 127.0.0.1",
      4200,
      [
        "node scripts/verify-webkit-engine.mjs http://127.0.0.1:4200",
        "node scripts/verify-webkit-engine.mjs http://127.0.0.1:4200 --first-session",
      ],
    )
    checked = checked
      .withExec(["bun", "run", "test:e2e:interp"])
      .withExec(["bun", "run", "test:e2e:chat:grounding"])
      .withExec(["bun", "run", "test:e2e:rectification"])
      .withExec(["bun", "run", "test:e2e:wizard"])

    const real = checked.withEnvVariable("VITE_EXIT_GATE_HOOKS", "").withExec([
      "./node_modules/.bin/vite",
      "build",
      "--outDir",
      "dist-real",
    ])
    return this.localPreview(real, "dist-real", [
      "node scripts/verify-real-onboarding.mjs http://127.0.0.1:4199",
      "node scripts/verify-onboarding-recovery.mjs http://127.0.0.1:4199",
    ])
  }
  @func()
  pdf(): Container {
    return this.browserBase(["chromium"])
      .withExec(["bun", "run", "test:e2e:ai"])
      .withExec(["bun", "run", "test:e2e:report:pdf"])
  }
  @func()
  privacy(): Container {
    const built = this.builtBrowser("dist-privacy", false, ["chromium"])
    return built
      .withServiceBinding("privacy", this.preview(built, "dist-privacy", 4173, "privacy"))
      .withEnvVariable("ALMAMESH_PRIVACY_CONTRACT", "backup-reset-v4")
      .withExec(["node", "scripts/verify-privacy-reset.mjs", "http://privacy:4173"])
  }
  @func()
  @check()
  async ci(): Promise<string> {
    const gates = [
      this.backend(),
      this.frontend(),
      this.browser(),
      this.pdf(),
      this.privacy(),
    ]
    for (const gate of gates) await gate.sync()
    return "Backend, frontend, browser, PDF, and privacy gates passed in sequence."
  }
  @func()
  secretScan(): Container {
    return dag
      .container()
      .from(GITLEAKS_IMAGE)
      .withEntrypoint([])
      .withDirectory(ROOT, this.source)
      .withWorkdir(ROOT)
      .withExec([
        "/usr/bin/gitleaks",
        "dir",
        ROOT,
        "--config",
        `${ROOT}/.gitleaks.toml`,
        "--redact",
        "--no-banner",
        "--no-color",
      ])
      .withExec([
        "sh",
        "-c",
        "test -z \"$(find backend -maxdepth 1 \\( -name 'keys*' -o -name 'origin*' \\) -print -quit)\"",
      ])
  }
  @func()
  async dependencyAudit(): Promise<string> {
    const python = this.uvBase()
      .withExec([
        "uv",
        "export",
        "--frozen",
        "--all-extras",
        "--no-emit-project",
        "--no-hashes",
        "-o",
        "/tmp/requirements.txt",
      ])
      .withExec(["uvx", "pip-audit", "-r", "/tmp/requirements.txt", "--disable-pip", "--no-deps"])
    const frontend = this.bunBase().withExec(["bun", "audit"])
    await Promise.all([python.sync(), frontend.sync()])
    return "Python and Bun locked dependency graphs passed their advisory audits."
  }
  @func()
  productionArtifact(
    bundlePrivateKeyB64: Secret,
    bundlePublicKeyB64: Secret,
    expectedSha: string,
    bundleVersion: string,
    bundleSequence: number,
  ): Directory {
    return this.signedBuild(
      bundlePrivateKeyB64,
      bundlePublicKeyB64,
      expectedSha,
      bundleVersion,
      bundleSequence,
    ).directory(DIST)
  }
  @func()
  deployDryRun(expectedSha: string): Container {
    return this.withoutSigningSecrets(
      this.releaseBase()
        .withMountedTemp(KEYS)
        .withEnvVariable("EXPECTED_SHA", expectedSha)
        .withExec(["bash", "-c", this.dryRunBuildScript()]),
    ).withExec(["bash", "-c", this.pagesDryRunScript()])
  }
  @func()
  deploy(
    cloudflareApiToken: Secret,
    cloudflareAccountId: Secret,
    bundlePrivateKeyB64: Secret,
    bundlePublicKeyB64: Secret,
    expectedSha: string,
  ): Container {
    return this.withoutSigningSecrets(
      this.signedBuild(
        bundlePrivateKeyB64,
        bundlePublicKeyB64,
        expectedSha,
      ),
    )
      .withSecretVariable("CLOUDFLARE_API_TOKEN", cloudflareApiToken)
      .withSecretVariable("CLOUDFLARE_ACCOUNT_ID", cloudflareAccountId)
      .withExec(["bash", "-c", this.pagesDeployScript()])
  }
  @func()
  verifyLive(expectedSha: string, artifact: Directory): Container {
    return dag
      .container()
      .from(BUN_IMAGE)
      .withDirectory("/artifact", artifact)
      .withEnvVariable("EXPECTED_SHA", expectedSha)
      .withExec(["bash", "-c", this.liveVerificationScript("/artifact")])
  }
  @func()
  web(): Directory {
    return this.bunBase()
      .withWorkdir(WEB)
      .withExec(["bun", "run", "build"])
      .directory(`${WEB}/dist`)
  }
  @func()
  serve(): Service {
    const built = this.builtBrowser("dist")
    return this.preview(built, "dist", 4173)
  }
  @func()
  nightly(openrouterApiKey?: Secret): Container {
    const runner = this.browserBase(["chromium"])
      .withoutMount("/root/.cache/uv").withoutMount("/root/.bun/install/cache").withoutMount("/root/.skyfield-data")
    return (openrouterApiKey ? runner.withSecretVariable("OPENROUTER_API_KEY", openrouterApiKey) : runner)
      .withExec(["node", "scripts/build-sw-update-fixtures.mjs"])
      .withExec(["bun", "run", "test:e2e:sw-update"])
      .withExec(["bun", "run", "test:e2e:ai"])
      .withExec(["bun", "run", "test:e2e:interp"])
      .withExec(["bun", "run", "test:e2e:chat:grounding"])
      .withExec(["bun", "run", "test:e2e:rectification"])
      .withExec(["bun", "run", "test:e2e:wizard"])
      .withExec(["bun", "run", "test:e2e:report:pdf"])
      .withExec(["bun", "run", "test:e2e:dual-voice"])
      .withExec(["bun", "run", "test:e2e:interp:real"])
      .withExec(["bun", "run", "test:e2e:interp:heal:real"])
      .withExec(["bun", "run", "test:e2e:chat:rag:real"])
      .withExec(["bun", "run", "test:e2e:dashboard:agentic:real"])
  }
  private signedBuild(
    privateKey: Secret,
    publicKey: Secret,
    expectedSha: string,
    bundleVersion?: string,
    bundleSequence?: number,
  ): Container {
    let build = this.releaseBase()
      .withMountedTemp(KEYS)
      .withSecretVariable("BUNDLE_PRIVATE_KEY_B64", privateKey)
      .withSecretVariable("BUNDLE_PUBLIC_KEY_B64", publicKey)
      .withEnvVariable("EXPECTED_SHA", expectedSha)
    if (bundleVersion !== undefined) {
      build = build.withEnvVariable("BUNDLE_VERSION_ARG", bundleVersion)
    }
    if (bundleSequence !== undefined) {
      build = build.withEnvVariable("BUNDLE_SEQUENCE_ARG", String(bundleSequence))
    }
    return build.withExec(["bash", "-c", this.productionBuildScript()])
  }
  private withoutSigningSecrets(container: Container): Container {
    return container
      .withoutSecretVariable("BUNDLE_PRIVATE_KEY_B64")
      .withoutSecretVariable("BUNDLE_PUBLIC_KEY_B64")
      .withoutMount(KEYS)
  }
  private productionBuildScript(): string {
    return `set -euo pipefail
printf '%s' "$EXPECTED_SHA" | grep -Eq '^[0-9a-f]{40}$' || { echo "expected SHA must be 40 lowercase hex characters" >&2; exit 2; }
cleanup() {
  if [ -f "${KEYS}/private.key" ]; then shred -f -n 3 -z --remove "${KEYS}/private.key"; fi
  rm -rf "${KEYS}/"*
}
trap cleanup EXIT
umask 077
printf '%s' "$BUNDLE_PRIVATE_KEY_B64" | base64 -d > "${KEYS}/private.key"
printf '%s' "$BUNDLE_PUBLIC_KEY_B64" | base64 -d > "${KEYS}/public.key"
chmod 600 "${KEYS}/private.key"
export BUILD_COMMIT="$EXPECTED_SHA" PRODUCTION_KEYS_DIR="${KEYS}"
if [ -n "\${BUNDLE_VERSION_ARG:-}" ] && [ -n "\${BUNDLE_SEQUENCE_ARG:-}" ]; then
  export BUNDLE_VERSION="$BUNDLE_VERSION_ARG" BUNDLE_SEQUENCE="$BUNDLE_SEQUENCE_ARG"
else
  rm -rf /tmp/almamesh-history
  git clone --quiet --filter=blob:none --no-checkout https://github.com/hseshadr/almamesh.git /tmp/almamesh-history
  git -C /tmp/almamesh-history fetch --quiet origin "$EXPECTED_SHA"
  export BUNDLE_SEQUENCE="$(git -C /tmp/almamesh-history rev-list --count "$EXPECTED_SHA")"
  export BUNDLE_VERSION="$(git -C /tmp/almamesh-history describe --tags --abbrev=0 "$EXPECTED_SHA" 2>/dev/null || printf '0.0.0+%s' "\${EXPECTED_SHA:0:7}")"
  export BUNDLE_LIVE_URL="${LIVE_ORIGIN}/bundle/latest"
fi
bash scripts/build-prod.sh`
  }
  private dryRunBuildScript(): string {
    return `set -euo pipefail
printf '%s' "$EXPECTED_SHA" | grep -Eq '^[0-9a-f]{40}$' || { echo "expected SHA must be 40 lowercase hex characters" >&2; exit 2; }
cleanup() {
  if [ -f "${KEYS}/private.key" ]; then shred -f -n 3 -z --remove "${KEYS}/private.key"; fi
  rm -rf "${KEYS}/"*
}
trap cleanup EXIT
(cd ${ROOT}/backend && uv run almamesh-bundle keygen "${KEYS}")
export BUILD_COMMIT="$EXPECTED_SHA" PRODUCTION_KEYS_DIR="${KEYS}"
export BUNDLE_VERSION="dagger-dry-run" BUNDLE_SEQUENCE="1"
bash scripts/build-prod.sh`
  }
  private pagesDryRunScript(): string {
    return `set -euo pipefail
test "$($WRANGLER --version)" = "${WRANGLER_VERSION}"
$WRANGLER pages deploy --help | grep -q -- '--commit-hash'
$WRANGLER pages dev dist --ip 127.0.0.1 --port 8788 --compatibility-date=${WRANGLER_COMPATIBILITY_DATE} >/tmp/wrangler-pages.log 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -fsS http://127.0.0.1:8788/build.json >/tmp/build.json && break
  kill -0 "$pid" 2>/dev/null || { cat /tmp/wrangler-pages.log >&2; exit 1; }
  sleep 1
done
node -e 'const f=require("fs");const value=JSON.parse(f.readFileSync("/tmp/build.json","utf8"));if(value.commit!==process.env.EXPECTED_SHA)process.exit(1)'
curl -fsS http://127.0.0.1:8788/bundle/latest >/dev/null
echo "Wrangler Pages dry-run verified artifact for $EXPECTED_SHA"`
  }
  private pagesDeployScript(): string {
    return `set -euo pipefail
test "$($WRANGLER --version)" = "${WRANGLER_VERSION}"
$WRANGLER pages deploy dist --project-name=almamesh --branch=main --commit-hash="$EXPECTED_SHA" --commit-dirty=false
for attempt in $(seq 1 12); do
  $WRANGLER pages deployment list --project-name=almamesh --environment=production --json >/tmp/pages-deployments.json
  if node -e 'const f=require("fs");const value=JSON.parse(f.readFileSync("/tmp/pages-deployments.json","utf8"));const rows=Array.isArray(value)?value:(value.result||[]);const deployment=rows[0]||{};const metadata=deployment.deployment_trigger?.metadata||{};if(deployment.environment!=="production"||metadata.branch !== "main"||metadata.commit_hash !== process.env.EXPECTED_SHA)process.exit(1)'; then
    echo "Cloudflare Pages source identity verified: main $EXPECTED_SHA"
    break
  fi
  if [ "$attempt" = 12 ]; then echo "Cloudflare Pages did not record expected source identity" >&2; exit 1; fi
  sleep 5
done
${this.liveVerificationScript(DIST)}
key_file=$(find dist -maxdepth 1 -type f -name '????????????????????????????????.txt' -print -quit)
key="$(basename "\${key_file:-}" .txt)"
if printf '%s' "$key" | grep -Eq '^[0-9a-f]{32}$'; then
  curl -sS --max-time 30 -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json; charset=utf-8' --data '{"host":"almamesh.com","key":"'"$key"'","keyLocation":"https://almamesh.com/'"$key"'.txt","urlList":["https://almamesh.com/","https://almamesh.com/welcome","https://almamesh.com/privacy","https://almamesh.com/terms","https://almamesh.com/data-deletion"]}' >/dev/null || echo "IndexNow notification failed (non-fatal)" >&2
fi`
  }
  private liveVerificationScript(artifact: string): string {
    return `expected_bundle=$(node -e 'const f=require("fs");const p=JSON.parse(f.readFileSync("${artifact}/bundle/latest","utf8"));if(!p.manifest_hash||!Number.isInteger(p.sequence))process.exit(2);process.stdout.write(p.manifest_hash+":"+p.sequence)')
for attempt in $(seq 1 12); do
  actual_sha=$(curl -fsS --retry 2 --max-time 20 "${LIVE_ORIGIN}/build.json?t=$(date +%s)" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{process.stdout.write(JSON.parse(s).commit||"")}catch{}})') || true
  actual_bundle=$(curl -fsS --retry 2 --max-time 20 "${LIVE_ORIGIN}/bundle/latest?t=$(date +%s)" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const p=JSON.parse(s);if(p.manifest_hash&&Number.isInteger(p.sequence))process.stdout.write(p.manifest_hash+":"+p.sequence)}catch{}})') || true
  if [ "$actual_sha" = "$EXPECTED_SHA" ] && [ "$actual_bundle" = "$expected_bundle" ]; then echo "Live app and bundle identity verified: $actual_sha $actual_bundle"; exit 0; fi
  echo "Waiting for live identity attempt=$attempt expected_sha=$EXPECTED_SHA actual_sha=\${actual_sha:-missing} expected_bundle=$expected_bundle actual_bundle=\${actual_bundle:-missing}"
  sleep 10
done
echo "live application or bundle identity did not converge" >&2
exit 1`
  }
  private localPreview(container: Container, output: string, commands: readonly string[]): Container {
    const preview = `./node_modules/.bin/vite preview --outDir ${output} --host 127.0.0.1 --port 4199 --strictPort`
    return this.localServer(container, preview, 4199, commands)
  }
  private localServer(container: Container, server: string, port: number, commands: readonly string[]): Container {
    return container.withExec(["bash", "-c", `set -euo pipefail
${server} &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
for _ in {1..60}; do curl -fsS -o /dev/null http://127.0.0.1:${port} && break; kill -0 "$pid"; sleep 1; done; curl -fsS -o /dev/null http://127.0.0.1:${port}
${commands.join("\n")}`])
  }
  private preview(
    container: Container,
    output: string,
    port: number,
    allowedHost?: string,
  ): Service {
    let server = container.withExec([
      "sed",
      "-i",
      "s/; upgrade-insecure-requests//g",
      "public/_headers",
    ])
    if (allowedHost) {
      server = server.withEnvVariable("__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS", allowedHost)
    }
    return server.withExposedPort(port).asService({
      args: [
        "./node_modules/.bin/vite",
        "preview",
        "--outDir",
        output,
        "--host",
        "0.0.0.0",
        "--port",
        String(port),
        "--strictPort",
      ],
    })
  }
}
