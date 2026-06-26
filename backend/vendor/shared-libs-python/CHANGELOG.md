# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `shared_libs_python.vector_mgmt.testing` — `InMemoryVectorIndex` reference
  implementation and `in_memory_factory`, so the bundled `examples/` run
  end-to-end against a fresh checkout.
- `examples/run_loop.sh` — single-command end-to-end demo walking all three
  examples.

### Changed
- Root `README.md` rewritten for cold-reader clarity: 4-part TL;DR, ≤15-line
  teaser quickstart, source-tree diagram aligned to the actual layout.
- `examples/basic_usage.py`, `custom_partition_key.py`,
  `composite_partition_key.py` now use the bundled in-memory factory and
  produce real output (previously crashed with `NoneType has no attribute
  'insert'`).
- `CLAUDE.md`: dropped stale "Placeholder Modules" section
  (`vector_mgmt/indexing/`, `vector_mgmt/reindex/` were removed in v0.1.1);
  documented the `testing` module; fixed `metadata: dict[str, Any]` to
  `dict[str, Scalar]`.

### Removed
- Stale root-level review documents (`PROJECT_REVIEW.md`, `GITHUB_REVIEW.md`,
  `REVIEW_SUMMARY.md`) from the pre-v0.1.1 review cycle.

## [0.1.1] - 2026-05-21

### Changed
- Tightened the entire public surface to the strict python-quality bar: `mypy --strict` clean, Radon Grade A complexity (cyclomatic ≤ 5), all functions ≤ 15 lines, no `Dict[str, Any]` in user code.
- Replaced ad-hoc `dict[str, Any]` metadata/filter types with a `Scalar` / `Metadata` type alias pair (`Scalar = str | int | float | bool | None`).
- Introduced `IndexFactory` Protocol replacing the previous `Callable[..., Awaitable[VectorIndex]]` annotation.
- `IndexManager.search` refactored into `_compose_filters` + `_merge_top_k` helpers (Grade A).
- `TwoTierPartitionStrategy.get_partitions` refactored into a `_classify_embedding` helper (Grade A). Behavior preserved (naive `datetime.now()`; missing/non-string `created_at` → hot; parse error → cold).
- Magic-number thresholds in `IndexManager.rebuild_if_needed` named with `Final[float]`.
- Moved unused runtime extras (`pgvector`, `sqlalchemy[asyncio]`, `numpy`) from required dependencies to `[project.optional-dependencies].pgvector`. Default install is now lean (pydantic only).
- Added `poe` tasks: `lint`, `fmt`, `typecheck`, `complexity`, `test`, `quality`.
- Updated `pyproject.toml` author from "Vector Management Team" to "Harish Seshadri".

### Removed
- Empty `shared_libs_python.vector_mgmt.indexing` and `shared_libs_python.vector_mgmt.reindex` submodules (referenced nothing; no public symbols exported).
- "Reindexing utilities" feature claim from the README.

### Added
- `xenon`, `radon`, `poethepoet` as dev dependencies for the strict quality gate.

## [0.1.0] - 2025-01-15

### Added
- Initial release of shared-libs-python
- Generic partition key support (tenant_id, user_id, org_id, etc.)
- Three partitioning strategies:
  - `GlobalPartitionStrategy`: Single global index with metadata filtering
  - `BucketedPartitionStrategy`: Hash-based bucketing for scale
  - `TwoTierPartitionStrategy`: Hot/cold tier separation
- `IndexManager` for coordinating vector indices
- `VectorIndex` protocol for abstract index interface
- Type-safe implementation with Pydantic models
- Backward compatibility with `tenant_id` field
- Custom partition key extractors support
- Comprehensive documentation

### Features
- Generic partition key extraction from metadata
- Support for any partition key name
- Composite partition keys via custom extractors
- Full type hints and mypy strict compliance
- Protocol-based design for extensibility

[Unreleased]: https://github.com/hseshadr/shared-libs-python/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/hseshadr/shared-libs-python/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/hseshadr/shared-libs-python/releases/tag/v0.1.0


