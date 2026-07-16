export interface BuildIdentity {
  readonly commit: string
  readonly version: string
  readonly buildTime: string
}

/** Normalize a CI-provided immutable commit, while keeping local builds usable. */
export function normalizeBuildCommit(value: string | undefined): string {
  const commit = value?.trim()
  if (!commit) return 'local'
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error('BUILD_COMMIT must be a full 40-character hexadecimal commit SHA')
  }
  return commit.toLowerCase()
}

export function createBuildIdentity(
  commit: string | undefined,
  version: string,
  buildTime: string,
): BuildIdentity {
  return { commit: normalizeBuildCommit(commit), version, buildTime }
}
