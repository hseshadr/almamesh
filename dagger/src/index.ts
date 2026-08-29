import {
  CacheVolume,
  Container,
  Directory,
  Secret,
  Service,
  Workspace,
  dag,
  func,
  object,
} from "@dagger.io/dagger"

const ROOT = "/workspace"
const FRONTEND = `${ROOT}/frontend`
const WEB = `${FRONTEND}/apps/web`
const DIST = `${WEB}/dist`
const KEYS = "/run/almamesh-keys"
const BUN_INSTALLER = "/opt/almamesh/install-bun.sh"
const PAGES_SOURCE_VERIFIER = "/opt/almamesh/verify-pages-source.mjs"
const LIVE_ORIGIN = "https://almamesh.com"
const REPOSITORY = "hseshadr/almamesh"
const CONTRACT_SHA = "1111111111111111111111111111111111111111"
const BUN_IMAGE =
  "oven/bun:1.3.5@sha256:e90cdbaf9ccdb3d4bd693aa335c3310a6004286a880f62f79b18f9b1312a8ec3"
const NODE_IMAGE =
  "node:22-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284"
const PAGES_NODE_IMAGE =
  "node:24.6.0-bookworm-slim@sha256:9b741b28148b0195d62fa456ed84dd6c953c1f17a3761f3e6e6797a754d9edff"
const UV_IMAGE =
  "ghcr.io/astral-sh/uv:0.12.1-python3.13-trixie-slim@sha256:8db423175bfff42bd1c81f77280bc92f10ef9cf03161803bd5cb6e15d86c3d10"
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
const CONTRACT_TESTS = [
  "tests/dagger-foundation-contract.test.ts",
  "tests/dagger-workflow-contract.test.ts",
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
      .withFile(BUN_INSTALLER, this.source.file("dagger/scripts/install-bun.sh"))
      .withDirectory(ROOT, this.selected([".gitignore", ".github/workflows/**", "CHANGELOG.md", "README.md", "SECURITY.md", "backend/**", "dagger/**", "docs/**", "frontend/**", "testdata/**"]))
      .withWorkdir(FRONTEND)
      .withEnvVariable("ALMAMESH_CI_CONTRACT", "modern-v13")
      .withEnvVariable("HUSKY", "0")
      .withNewFile("/tmp/node-contract.cjs", "Promise.withResolvers ||= () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail }); return { promise, resolve, reject } }")
      .withEnvVariable("NODE_OPTIONS", "--require=/tmp/node-contract.cjs")
      .withEnvVariable("PYTHON", "/usr/bin/python3")
      .withExec([
        "sh",
        "-c",
        "apt-get update && apt-get install -y --no-install-recommends build-essential git node-gyp nodejs poppler-utils && rm -rf /var/lib/apt/lists/*",
      ])
      .withExec(["sh", BUN_INSTALLER])
      .withExec(["sh", "-c", `git -C ${ROOT} init && git -C ${ROOT} add -A`])
  }

  private pagesFunctionsBuildArgs(): string[] {
    return [
      "wrangler",
      "pages",
      "functions",
      "build",
      "functions",
      "--outfile=/derived/_worker.js",
      "--output-routes-path=/derived/_routes.json",
      "--project-directory=/project",
      "--build-output-directory=/project/dist",
      "--metafile=/derived/_build-metadata.json",
    ]
  }

  private pagesFunctionsBase(): Container {
    return dag
      .container({ platform: "linux/amd64" })
      .from(PAGES_NODE_IMAGE)
      .withEnvVariable("WRANGLER_SEND_METRICS", "false")
      .withExec([
        "npm",
        "install",
        "--global",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        "--loglevel=error",
        `wrangler@${WRANGLER_VERSION}`,
      ])
  }

  private pagesFunctionsBuild(roots: Directory): Container {
    const closedRoots = roots.withNewDirectory(".wrangler")
    return this.pagesFunctionsBase()
      .withMountedDirectory("/project", closedRoots, { readOnly: true })
      .withMountedTemp("/project/.wrangler")
      .withDirectory("/derived", dag.directory())
      .withMountedTemp("/run/functions-cache")
      .withMountedTemp("/run/functions-config")
      .withEnvVariable("WRANGLER_CACHE_DIR", "/run/functions-cache")
      .withEnvVariable("XDG_CONFIG_HOME", "/run/functions-config")
      .withWorkdir("/project")
      .withExec(this.pagesFunctionsBuildArgs())
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
      .withFile(BUN_INSTALLER, this.source.file("dagger/scripts/install-bun.sh"))
      .withFile(
        PAGES_SOURCE_VERIFIER,
        this.source.file("dagger/scripts/verify-pages-source.mjs"),
      )
      .withDirectory(ROOT, this.selected([".gitignore", "backend/**", "frontend/**"]))
      .withWorkdir(FRONTEND)
      .withEnvVariable("UV_LINK_MODE", "copy")
      .withEnvVariable("UV_PROJECT_ENVIRONMENT", "/opt/venv")
      .withEnvVariable("HUSKY", "0")
      .withEnvVariable("PYTHON", "/usr/bin/python3")
      .withEnvVariable("WRANGLER", WRANGLER)
      .withMountedCache("/root/.cache/uv", this.cache("uv"))
      .withExec([
        "sh",
        "-c",
        "apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl git node-gyp openssl poppler-utils python3 python3-dev && rm -rf /var/lib/apt/lists/*",
      ])
      .withExec(["sh", BUN_INSTALLER])
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
      .withFile(BUN_INSTALLER, this.source.file("dagger/scripts/install-bun.sh"))
      .withDirectory(ROOT, this.selected(["backend/**", "frontend/**"]))
      .withWorkdir(FRONTEND)
      .withEnvVariable("UV_LINK_MODE", "copy")
      .withEnvVariable("UV_PROJECT_ENVIRONMENT", "/opt/venv")
      .withEnvVariable("VITE_API_URL", "")
      .withEnvVariable("HUSKY", "0")
      .withEnvVariable("PYTHON", "/usr/bin/python3")
      .withMountedCache("/root/.cache/uv", this.cache("uv"))
      .withMountedCache("/root/.skyfield-data", this.cache("skyfield"))
      .withExec([
        "sh",
        "-c",
        "apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl git node-gyp nodejs openssl poppler-utils && rm -rf /var/lib/apt/lists/*",
      ])
      .withExec(["sh", BUN_INSTALLER])
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
  async contracts(): Promise<Container> {
    await this.deployDryRun(CONTRACT_SHA).sync()
    return dag
      .container()
      .from(BUN_IMAGE)
      .withDirectory(
        ROOT,
        this.selected([
          ".github/workflows/dagger.yml",
          "dagger.json",
          "dagger/scripts/**",
          "dagger/src/**",
          ...CONTRACT_TESTS,
        ]),
      )
      .withWorkdir(ROOT)
      .withExec(["bun", "test", ...CONTRACT_TESTS])
      .withExec(["printf", "%s\n", `Passed: ${CONTRACT_TESTS.join(" ")}`])
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
        "node scripts/verify-webkit-engine.mjs http://127.0.0.1:4200 --first-session --transient-cache-visibility",
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
  async ci(commitSha: string): Promise<string> {
    await (await this.contracts()).sync()
    const gates = [
      this.secretScan(commitSha),
      this.backend(),
      this.frontend(),
      this.browser(),
      this.pdf(),
      this.privacy(),
    ]
    for (const gate of gates) await gate.sync()
    return "Contract, secret, backend, frontend, browser, PDF, and privacy gates passed in sequence."
  }
  @func()
  secretScan(commitSha: string): Container {
    return dag
      .foundation()
      .guard(this.source, REPOSITORY, commitSha)
      .withDirectory(ROOT, this.source)
      .withWorkdir(ROOT)
      .withExec([
        "sh",
        "-ceu",
        'test -z "$(find backend -maxdepth 1 \\( -name \'keys*\' -o -name \'origin*\' \\) -print -quit)"',
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
    const release = this.withoutSigningSecrets(
      this.releaseBase()
        .withMountedTemp(KEYS)
        .withEnvVariable("EXPECTED_SHA", expectedSha)
        .withExec(["bash", "-c", this.dryRunBuildScript()]),
    )
    const functions = dag.directory().withFile(
      "api/feedback.ts",
      this.source.file("frontend/apps/web/functions/api/feedback.ts"),
    )
    const roots = dag
      .directory()
      .withDirectory("dist", release.directory(DIST))
      .withDirectory("functions", functions)
    const derived = this.pagesFunctionsBuild(roots).directory("/derived")
    const staged = roots
      .directory("dist")
      .withFile("_worker.js", derived.file("_worker.js"))
      .withFile("_routes.json", derived.file("_routes.json"))
    const closedRoots = roots.withNewDirectory(".wrangler")
    return this.pagesFunctionsBase()
      .withMountedDirectory("/project", closedRoots, { readOnly: true })
      .withMountedTemp("/project/.wrangler")
      .withMountedTemp("/run/functions-cache")
      .withMountedTemp("/run/functions-config")
      .withEnvVariable("WRANGLER_CACHE_DIR", "/run/functions-cache")
      .withEnvVariable("XDG_CONFIG_HOME", "/run/functions-config")
      .withFile("/compiled/_worker.js", staged.file("_worker.js"))
      .withFile("/compiled/_routes.json", staged.file("_routes.json"))
      .withFile("/compiled/_build-metadata.json", derived.file("_build-metadata.json"))
      .withWorkdir("/project")
      .withEnvVariable("EXPECTED_SHA", expectedSha)
      .withExec(["bash", "-c", this.pagesFunctionsDryRunScript()])
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
  private pagesFunctionsDryRunScript(): string {
    return `set -euo pipefail
test "$(wrangler --version)" = "${WRANGLER_VERSION}"
test -f /compiled/_worker.js
test -f /compiled/_routes.json
test -f /compiled/_build-metadata.json
wrangler pages dev dist --ip 127.0.0.1 --port 8788 --compatibility-date=${WRANGLER_COMPATIBILITY_DATE} >/tmp/wrangler-pages.log 2>&1 &
pid=$!
stop_server() {
  if ! kill -0 "$pid" 2>/dev/null; then wait "$pid" 2>/dev/null || true; return 0; fi
  kill -TERM "$pid" 2>/dev/null || return 1
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then wait "$pid" 2>/dev/null || true; return 0; fi
    sleep 0.1
  done
  kill -KILL "$pid" 2>/dev/null || return 1
  wait "$pid" 2>/dev/null || true
  ! kill -0 "$pid" 2>/dev/null
}
cleanup() {
  status=$?
  trap - EXIT
  if ! stop_server; then cat /tmp/wrangler-pages.log >&2; exit 1; fi
  if [ "$status" -ne 0 ]; then cat /tmp/wrangler-pages.log >&2; fi
  exit "$status"
}
trap cleanup EXIT
feedback_verified=""
for _ in $(seq 1 60); do
  if node -e 'fetch("http://127.0.0.1:8788/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(async response=>{const body=await response.json();if(response.status!==400||JSON.stringify(body)!==JSON.stringify({ok:false,error:"invalid_page"}))process.exit(1)}).catch(()=>process.exit(75))'; then
    feedback_verified=1
    break
  else
    request_status=$?
    [ "$request_status" -eq 75 ] || exit "$request_status"
  fi
  kill -0 "$pid" 2>/dev/null || { cat /tmp/wrangler-pages.log >&2; exit 1; }
  sleep 1
done
test "$feedback_verified" = "1"
echo "Wrangler Pages Functions dry-run verified closed feedback route for $EXPECTED_SHA"`
  }
  private pagesDeployScript(): string {
    return `set -euo pipefail
test "$($WRANGLER --version)" = "${WRANGLER_VERSION}"
$WRANGLER pages deploy dist --project-name=almamesh --branch=main --commit-hash="$EXPECTED_SHA" --commit-dirty=false
node ${PAGES_SOURCE_VERIFIER}
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
