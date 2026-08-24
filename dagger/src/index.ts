import {
  CacheVolume,
  Container,
  Directory,
  Secret,
  Service,
  check,
  dag,
  func,
  object,
} from "@dagger.io/dagger"

const ROOT = "/workspace"
const FRONTEND = `${ROOT}/frontend`
const WEB = `${FRONTEND}/apps/web`
const BUN_IMAGE =
  "oven/bun:1.3.5@sha256:e90cdbaf9ccdb3d4bd693aa335c3310a6004286a880f62f79b18f9b1312a8ec3"
const UV_IMAGE =
  "ghcr.io/astral-sh/uv:0.12.1-python3.13-trixie-slim@sha256:8db423175bfff42bd1c81f77280bc92f10ef9cf03161803bd5cb6e15d86c3d10"

@object()
export class AlmameshCi {
  private source(include: string[]): Directory {
    return dag.currentWorkspace().directory("/", {
      include,
      exclude: [".git/**", "**/.env", "**/.env.local", "**/.env.*.local", "**/*private*.key", "**/node_modules/**", "**/dist*/**", "**/.venv/**"],
      gitignore: false,
    })
  }
  private cache(name: string): CacheVolume {
    return dag.cacheVolume(`almamesh-${name}`)
  }
  private bunBase(): Container {
    return dag
      .container()
      .from(BUN_IMAGE)
      .withDirectory(ROOT, this.source([".gitignore", ".github/workflows/deploy.yml", ".github/workflows/test.yml", "CHANGELOG.md", "README.md", "SECURITY.md", "backend/offline_wheels/**", "backend/src/**", "backend/tests/**", "docs/**", "frontend/**", "testdata/**"]))
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
        this.source([
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

  private browserBase(browsers: string[]): Container {
    const bun = dag.container().from(BUN_IMAGE).file("/usr/local/bin/bun")
    return dag
      .container()
      .from(UV_IMAGE)
      .withFile("/usr/local/bin/bun", bun)
      .withDirectory(ROOT, this.source(["backend/**", "frontend/**"]))
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
  @check()
  backend(): Container {
    return this.uvBase().withExec(["uv", "run", "poe", "gate"])
  }
  @func()
  @check()
  frontend(): Container {
    return this.bunBase().withExec(["bun", "run", "gate"])
  }
  @func()
  @check()
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
  @check()
  pdf(): Container {
    return this.browserBase(["chromium"])
      .withExec(["bun", "run", "test:e2e:ai"])
      .withExec(["bun", "run", "test:e2e:report:pdf"])
  }
  @func()
  @check()
  privacy(): Container {
    const built = this.builtBrowser("dist-privacy", false, ["chromium"])
    return built
      .withServiceBinding("privacy", this.preview(built, "dist-privacy", 4173, "privacy"))
      .withEnvVariable("ALMAMESH_PRIVACY_CONTRACT", "backup-reset-v4")
      .withExec(["node", "scripts/verify-privacy-reset.mjs", "http://privacy:4173"])
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
  nightly(openrouterApiKey: Secret): Container {
    return this.browserBase(["chromium"])
      .withoutMount("/root/.cache/uv").withoutMount("/root/.bun/install/cache").withoutMount("/root/.skyfield-data")
      .withSecretVariable("OPENROUTER_API_KEY", openrouterApiKey)
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
