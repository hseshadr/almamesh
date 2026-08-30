import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const workflowPath = resolve(root, ".github/workflows/dagger.yml")
const deployWorkflowPath = resolve(root, ".github/workflows/deploy.yml")
const deployHelpContractPath = resolve(root, "dagger/scripts/verify-deploy-help.sh")
const checkout = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
const daggerAction = "dagger/dagger-for-github@27b130bf0f79a7f6fbbbe0fbca6760dc9bb40a77"
const deployHelpFixture = `-

USAGE
  dagger call deploy [arguments]

ARGUMENTS
      --bundle-private-key-b-64 Secret   [required]
      --bundle-public-key-b-64 Secret    [required]
      --cloudflare-account-id Secret     [required]
      --cloudflare-api-token Secret      [required]
      --expected-sha string              [required]
      --github-token Secret              [required]
      --run-attempt int                  [required]
      --workflow-run-id string           [required]
`

type Mapping = Record<string, unknown>

function mapping(value: unknown): Mapping {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Mapping
    : {}
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]))
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Mapping
    const rightRecord = right as Mapping
    const leftKeys = Object.keys(leftRecord).sort()
    const rightKeys = Object.keys(rightRecord).sort()
    return sameValue(leftKeys, rightKeys)
      && leftKeys.every((key) => sameValue(leftRecord[key], rightRecord[key]))
  }
  return left === right
}

function exactDaggerWorkflowViolations(source: string): string[] {
  const workflow = mapping(Bun.YAML.parse(source))
  const triggers = mapping(workflow.on)
  const jobs = mapping(workflow.jobs)
  const job = mapping(jobs.dagger)
  const steps = Array.isArray(job.steps) ? job.steps : []
  const violations: string[] = []

  if (workflow.name !== "Dagger") violations.push("workflow-name")
  if (!sameValue(triggers, {
    push: { branches: ["main"] },
    pull_request: null,
  })) violations.push("triggers")
  if (!sameValue(workflow.permissions, { contents: "read" })) violations.push("permissions")
  if (!sameValue(workflow.concurrency, {
    group: "${{ github.workflow }}-${{ github.ref }}",
    "cancel-in-progress": true,
  })) violations.push("concurrency")
  if (!sameValue(Object.keys(jobs), ["dagger"])) violations.push("jobs")
  if (!sameValue(job, {
    name: "Dagger",
    "runs-on": "ubuntu-latest",
    "timeout-minutes": 120,
    steps: [
      {
        uses: checkout,
        with: {
          "fetch-depth": 0,
          "persist-credentials": false,
          ref: "${{ github.sha }}",
        },
      },
      {
        uses: daggerAction,
        with: {
          version: "0.21.8",
          call: "ci --commit-sha=${{ github.sha }}",
        },
      },
      {
        name: "Verify generated deploy CLI",
        shell: "bash",
        run: "set -o pipefail\ndagger call deploy --help | dagger/scripts/verify-deploy-help.sh\n",
      },
    ],
  })) violations.push("dagger-job")

  return violations
}

function exactDeployWorkflowViolations(source: string): string[] {
  const workflow = mapping(Bun.YAML.parse(source))
  const jobs = mapping(workflow.jobs)
  const job = mapping(jobs.deploy)
  const violations: string[] = []

  if (workflow.name !== "Deploy almamesh.com") violations.push("workflow-name")
  if (!source.includes("on: # zizmor: ignore[dangerous-triggers] deploy-after-CI by design; exact same-repo push/main/success attempt is revalidated before secrets or provider access")) {
    violations.push("dangerous-trigger-exemption")
  }
  if (!sameValue(mapping(workflow.on), {
    workflow_run: {
      workflows: ["Dagger"],
      types: ["completed"],
      branches: ["main"],
    },
  })) violations.push("triggers")
  if (!sameValue(workflow.permissions, {
    actions: "read",
    checks: "read",
    contents: "read",
  })) violations.push("permissions")
  if (!sameValue(workflow.concurrency, {
    group: "deploy-almamesh-com",
    "cancel-in-progress": false,
  })) violations.push("concurrency")
  if (!sameValue(Object.keys(jobs), ["deploy"])) violations.push("jobs")
  if (!sameValue(job, {
    name: "Build + deploy to Cloudflare Pages (Dagger)",
    if: "github.event.workflow_run.event == 'push' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.head_repository.full_name == github.repository",
    environment: "production",
    "runs-on": "ubuntu-latest",
    "timeout-minutes": 120,
    steps: [
      {
        uses: checkout,
        with: {
          "fetch-depth": 0,
          "persist-credentials": false,
          ref: "${{ github.event.workflow_run.head_sha }}",
        },
      },
      {
        uses: daggerAction,
        env: {
          BUNDLE_PRIVATE_KEY_B64: "${{ secrets.BUNDLE_PRIVATE_KEY_B64 }}",
          BUNDLE_PUBLIC_KEY_B64: "${{ secrets.BUNDLE_PUBLIC_KEY_B64 }}",
          CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
          CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
          GITHUB_TOKEN: "${{ github.token }}",
        },
        with: {
          version: "0.21.8",
          verb: "call",
          args: "deploy --github-token=env:GITHUB_TOKEN --cloudflare-api-token=env:CLOUDFLARE_API_TOKEN --cloudflare-account-id=env:CLOUDFLARE_ACCOUNT_ID --bundle-private-key-b-64=env:BUNDLE_PRIVATE_KEY_B64 --bundle-public-key-b-64=env:BUNDLE_PUBLIC_KEY_B64 --expected-sha=${{ github.event.workflow_run.head_sha }} --workflow-run-id=${{ github.event.workflow_run.id }} --run-attempt=${{ github.event.workflow_run.run_attempt }}",
        },
      },
    ],
  })) violations.push("deploy-job")

  return violations
}

const canonicalFixture = [
  "name: Dagger",
  "",
  "on:",
  "  push:",
  "    branches: [main]",
  "  pull_request:",
  "",
  "permissions:",
  "  contents: read",
  "",
  "concurrency:",
  "  group: ${{ github.workflow }}-${{ github.ref }}",
  "  cancel-in-progress: true",
  "",
  "jobs:",
  "  dagger:",
  "    name: Dagger",
  "    runs-on: ubuntu-latest",
  "    timeout-minutes: 120",
  "    steps:",
  `      - uses: ${checkout} # v7`,
  "        with:",
  "          fetch-depth: 0",
  "          persist-credentials: false",
  "          ref: ${{ github.sha }}",
  `      - uses: ${daggerAction} # v8.4.1`,
  "        with:",
  "          version: \"0.21.8\"",
  "          call: ci --commit-sha=${{ github.sha }}",
  "      - name: Verify generated deploy CLI",
  "        shell: bash",
  "        run: |",
  "          set -o pipefail",
  "          dagger call deploy --help | dagger/scripts/verify-deploy-help.sh",
  "",
].join("\n")

const canonicalDeployFixture = [
  "name: Deploy almamesh.com",
  "",
  "on: # zizmor: ignore[dangerous-triggers] deploy-after-CI by design; exact same-repo push/main/success attempt is revalidated before secrets or provider access",
  "  workflow_run:",
  "    workflows: [\"Dagger\"]",
  "    types: [completed]",
  "    branches: [main]",
  "",
  "permissions:",
  "  actions: read",
  "  checks: read",
  "  contents: read",
  "",
  "concurrency:",
  "  group: deploy-almamesh-com",
  "  cancel-in-progress: false",
  "",
  "jobs:",
  "  deploy:",
  "    name: Build + deploy to Cloudflare Pages (Dagger)",
  "    if: >-",
  "      github.event.workflow_run.event == 'push' &&",
  "      github.event.workflow_run.conclusion == 'success' &&",
  "      github.event.workflow_run.head_branch == 'main' &&",
  "      github.event.workflow_run.head_repository.full_name == github.repository",
  "    environment: production",
  "    runs-on: ubuntu-latest",
  "    timeout-minutes: 120",
  "    steps:",
  `      - uses: ${checkout} # v7`,
  "        with:",
  "          fetch-depth: 0",
  "          persist-credentials: false",
  "          ref: ${{ github.event.workflow_run.head_sha }}",
  `      - uses: ${daggerAction} # v8.4.1`,
  "        env:",
  "          BUNDLE_PRIVATE_KEY_B64: ${{ secrets.BUNDLE_PRIVATE_KEY_B64 }}",
  "          BUNDLE_PUBLIC_KEY_B64: ${{ secrets.BUNDLE_PUBLIC_KEY_B64 }}",
  "          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
  "          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
  "          GITHUB_TOKEN: ${{ github.token }}",
  "        with:",
  "          version: \"0.21.8\"",
  "          verb: call",
  "          args: >-",
  "            deploy",
  "            --github-token=env:GITHUB_TOKEN",
  "            --cloudflare-api-token=env:CLOUDFLARE_API_TOKEN",
  "            --cloudflare-account-id=env:CLOUDFLARE_ACCOUNT_ID",
  "            --bundle-private-key-b-64=env:BUNDLE_PRIVATE_KEY_B64",
  "            --bundle-public-key-b-64=env:BUNDLE_PUBLIC_KEY_B64",
  "            --expected-sha=${{ github.event.workflow_run.head_sha }}",
  "            --workflow-run-id=${{ github.event.workflow_run.id }}",
  "            --run-attempt=${{ github.event.workflow_run.run_attempt }}",
  "",
].join("\n")

describe("atomic hosted Dagger workflow", () => {
  test("the committed workflow has one exact-SHA Dagger check and no alternate ingress", () => {
    const source = readFileSync(workflowPath, "utf8")
    expect(exactDaggerWorkflowViolations(source)).toEqual([])
  })

  test.each([
    {
      name: "bare ci",
      source: canonicalFixture.replace(
        "call: ci --commit-sha=${{ github.sha }}",
        "call: ci",
      ),
      violation: "dagger-job",
    },
    {
      name: "manual dispatch",
      source: canonicalFixture.replace("  pull_request:\n", "  pull_request:\n  workflow_dispatch:\n"),
      violation: "triggers",
    },
    {
      name: "extra module selection",
      source: canonicalFixture.replace(
        "          call: ci --commit-sha=${{ github.sha }}",
        "          module: ./dagger\n          call: ci --commit-sha=${{ github.sha }}",
      ),
      violation: "dagger-job",
    },
    {
      name: "permissive checkout ref",
      source: canonicalFixture.replace(
        "          ref: ${{ github.sha }}",
        "          ref: refs/heads/main",
      ),
      violation: "dagger-job",
    },
    {
      name: "renamed protected check",
      source: canonicalFixture.replace("    name: Dagger", "    name: CI"),
      violation: "dagger-job",
    },
    {
      name: "missing generated-help probe",
      source: canonicalFixture.replace(
        "      - name: Verify generated deploy CLI\n        shell: bash\n        run: |\n          set -o pipefail\n          dagger call deploy --help | dagger/scripts/verify-deploy-help.sh\n",
        "",
      ),
      violation: "dagger-job",
    },
    {
      name: "wrong generated-help function",
      source: canonicalFixture.replace(
        "dagger call deploy --help",
        "dagger call deploy-dry-run --help",
      ),
      violation: "dagger-job",
    },
  ])("rejects $name", ({ source, violation }) => {
    expect(source).not.toBe(canonicalFixture)
    expect(exactDaggerWorkflowViolations(source)).toContain(violation)
  })
})

describe("privileged production delivery workflow", () => {
  test("the canonical production fixture is closed", () => {
    expect(exactDeployWorkflowViolations(canonicalDeployFixture)).toEqual([])
  })

  test("binds one same-repository green-main Dagger attempt to production", () => {
    const source = readFileSync(deployWorkflowPath, "utf8")
    expect(exactDeployWorkflowViolations(source)).toEqual([])
  })

  test("the generated deploy help exposes exactly the workflow's typed flags", () => {
    const result = Bun.spawnSync({
      cmd: ["bash", deployHelpContractPath],
      stdin: Buffer.from(deployHelpFixture),
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).toBe(0)
  })

  test.each([
    [
      "legacy private-key spelling",
      deployHelpFixture.replace("private-key-b-64", ["private-key-b", "64"].join("")),
    ],
    ["missing run attempt", deployHelpFixture.replace("      --run-attempt int                  [required]\n", "")],
    ["unexpected argument", deployHelpFixture.replace("ARGUMENTS\n", "ARGUMENTS\n      --project string                   [required]\n")],
  ])("rejects %s in generated deploy help", (_name, source) => {
    const result = Bun.spawnSync({
      cmd: ["bash", deployHelpContractPath],
      stdin: Buffer.from(source),
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).not.toBe(0)
  })

  test.each([
    {
      name: "manual bypass",
      source: canonicalDeployFixture.replace(
        "  workflow_run:\n",
        "  workflow_dispatch:\n  workflow_run:\n",
      ),
      violation: "triggers",
    },
    {
      name: "fork authorization removed",
      source: canonicalDeployFixture.replace(
        "      github.event.workflow_run.head_repository.full_name == github.repository",
        "      true",
      ),
      violation: "deploy-job",
    },
    {
      name: "checks permission removed",
      source: canonicalDeployFixture.replace("  checks: read\n", ""),
      violation: "permissions",
    },
    {
      name: "GitHub token interpolated",
      source: canonicalDeployFixture.replace(
        "--github-token=env:GITHUB_TOKEN",
        "--github-token=${{ github.token }}",
      ),
      violation: "deploy-job",
    },
    {
      name: "deploy workflow run id",
      source: canonicalDeployFixture.replace(
        "--workflow-run-id=${{ github.event.workflow_run.id }}",
        "--workflow-run-id=${{ github.run_id }}",
      ),
      violation: "deploy-job",
    },
    {
      name: "deploy workflow attempt",
      source: canonicalDeployFixture.replace(
        "--run-attempt=${{ github.event.workflow_run.run_attempt }}",
        "--run-attempt=${{ github.run_attempt }}",
      ),
      violation: "deploy-job",
    },
    {
      name: "legacy generated secret flag spelling",
      source: canonicalDeployFixture.replace(
        "--bundle-private-key-b-64=env:BUNDLE_PRIVATE_KEY_B64",
        "--bundle-private-key-b64=env:BUNDLE_PRIVATE_KEY_B64",
      ),
      violation: "deploy-job",
    },
    {
      name: "terminal deploy subcommand",
      source: canonicalDeployFixture.replace(
        "--run-attempt=${{ github.event.workflow_run.run_attempt }}",
        "--run-attempt=${{ github.event.workflow_run.run_attempt }} sync",
      ),
      violation: "deploy-job",
    },
    {
      name: "canceling mutex",
      source: canonicalDeployFixture.replace(
        "  cancel-in-progress: false",
        "  cancel-in-progress: true",
      ),
      violation: "concurrency",
    },
    {
      name: "no production environment",
      source: canonicalDeployFixture.replace("    environment: production\n", ""),
      violation: "deploy-job",
    },
  ])("rejects $name", ({ source, violation }) => {
    expect(source).not.toBe(canonicalDeployFixture)
    expect(exactDeployWorkflowViolations(source)).toContain(violation)
  })
})
