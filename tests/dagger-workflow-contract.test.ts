import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const workflowPath = resolve(root, ".github/workflows/dagger.yml")
const checkout = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
const daggerAction = "dagger/dagger-for-github@27b130bf0f79a7f6fbbbe0fbca6760dc9bb40a77"

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
    ],
  })) violations.push("dagger-job")

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
  ])("rejects $name", ({ source, violation }) => {
    expect(source).not.toBe(canonicalFixture)
    expect(exactDaggerWorkflowViolations(source)).toContain(violation)
  })
})
