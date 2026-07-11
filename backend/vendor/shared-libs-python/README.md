# shared-libs-python

[![CI](https://github.com/hseshadr/shared-libs-python/actions/workflows/ci.yml/badge.svg)](https://github.com/hseshadr/shared-libs-python/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/hseshadr/shared-libs-python/branch/main/graph/badge.svg)](https://codecov.io/gh/hseshadr/shared-libs-python)
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI models turn text, images, and products into **embeddings** — long lists of
numbers where similar things get similar numbers. Finding the embeddings closest
to a query is called **vector search**, and it is how "more like this" features
work.

This library answers one specific, deceptively hard question about vector
search: when your data belongs to many different owners — users, tenants, time
periods — **how do you split it up so search stays fast and nobody ever sees
anyone else's results?** You bring the search index (FAISS, pgvector, hnswlib,
…); this library routes every vector into the right partition and merges
search results back out. Swapping partitioning schemes is a one-line change,
and the index backend never has to know.

It is the bottom, most generic layer of a three-repo MIT-licensed stack — the
partitioning protocol, nothing more:

```
edge-reco        the reference product: hybrid search + recommendations, in the browser
  └─ edge-proc   the reusable local-compute substrate (FAISS-backed localvec runtime)
       └─ shared-libs-python   ← you are here: the vector-partitioning protocol
```

**Status:** v0.1.3, alpha. Small and focused by design — the foundation, not
the headline.

## 60-second quickstart

A teaser against the bundled in-memory reference index — produces real output.

```python
import asyncio
from shared_libs_python import GlobalPartitionStrategy, IndexManager
from shared_libs_python.vector_mgmt.core.types import VectorEmbedding
from shared_libs_python.vector_mgmt.testing import in_memory_factory

async def demo() -> None:
    strategy = GlobalPartitionStrategy(index_factory=in_memory_factory)
    manager = IndexManager(partition_strategy=strategy)
    await manager.insert(
        [VectorEmbedding(entity_id="a", embedding=[0.1, 0.2, 0.3, 0.4], tenant_id="t1")],
        partition_key="t1",
    )
    print(await manager.search([0.1, 0.2, 0.3, 0.4], k=5, partition_key="t1"))

asyncio.run(demo())  # → [('a', ~0.0)]  exact match, cosine distance ≈ 0
```

Or run all three bundled examples end-to-end:

```bash
git clone https://github.com/hseshadr/shared-libs-python.git
cd shared-libs-python
uv sync
bash examples/run_loop.sh
```

`InMemoryVectorIndex` is a reference implementation for tests and examples; in
production you implement `VectorIndex` against your own backend. See
[`edge-proc`'s `LocalVecIndex`](https://github.com/hseshadr/edge-proc) for a
FAISS-backed example.

## Installation

```bash
# From a git tag (recommended)
uv pip install git+https://github.com/hseshadr/shared-libs-python.git@v0.1.3

# Or from a GitHub Release wheel
uv pip install https://github.com/hseshadr/shared-libs-python/releases/download/v0.1.3/shared_libs_python-0.1.3-py3-none-any.whl
```

In your `pyproject.toml`:
```toml
dependencies = [
  "shared-libs-python @ git+https://github.com/hseshadr/shared-libs-python.git@v0.1.3",
]
```

For local development:
```bash
git clone https://github.com/hseshadr/shared-libs-python.git
cd shared-libs-python
uv sync
```

## Under the hood (for developers)

- **Two Protocols decouple everything.** The partitioning strategy is separated
  from the index backend behind `VectorIndex` and `IndexFactory`. Swap the
  strategy (`Global` / `Bucketed` / `TwoTier`) without touching the index; swap
  the index without touching the strategy.
- **Why it exists.** Every multi-tenant vector-search system rediscovers the
  same partitioning patterns ("global + filter", "hash buckets", "hot/cold").
  This library does that once, cleanly typed, so downstream projects
  (`edge-proc`, …) can `import shared_libs_python` instead of reinventing it.
- **Quality bar.** `mypy --strict` clean, xenon Grade A complexity, ≥90% branch
  coverage. Backwards-compatible with the legacy `tenant_id` API.

[`edge-proc`](https://github.com/hseshadr/edge-proc) implements this library's
`VectorIndex` protocol over FAISS, and [`edge-reco`](https://github.com/hseshadr/edge-reco)
([live demo](https://edge-reco.com)) is built on `edge-proc`. A clean partitioning
protocol is what lets the vector index ship as a content-addressed, CDN-distributable,
locally-runnable artifact — the foundation of zero-per-query-cost, offline-capable
search.

### Source tree

```
shared_libs_python/
  vector_mgmt/
    core/
      types.py          # VectorEmbedding, IndexConfig, IndexStats, VectorIndex, IndexFactory
      index_manager.py  # IndexManager — routes inserts, merges top-k searches
    partitioning/
      strategies.py     # GlobalPartitionStrategy, BucketedPartitionStrategy, TwoTierPartitionStrategy
    testing.py          # InMemoryVectorIndex — reference impl for tests + examples
examples/               # basic / custom-key / composite-key, plus run_loop.sh
tests/                  # pytest suite (≥90% branch coverage)
```

### Partitioning strategies

All strategies accept `partition_key_name` (default `"tenant_id"`) and an
optional `partition_key_extractor` callable.

| Strategy | When to use | How it routes |
|----------|-------------|---------------|
| `GlobalPartitionStrategy` | < 50K partition keys | One global index; filter by metadata at query time |
| `BucketedPartitionStrategy` | 50K – 5M partition keys | Hash the partition key into one of N buckets (default 256) |
| `TwoTierPartitionStrategy` | Time-keyed workloads | Split by `metadata["created_at"]` into a hot tier and a cold tier |

The deep dive (rationale, scaling math, recommended `m` / `ef_construction`)
lives in [`docs/vector-mgmt-architecture.md`](docs/vector-mgmt-architecture.md).

### Generic partition keys

The library was originally `tenant_id`-only. v0.1+ supports any partition key:

- store it in `VectorEmbedding.metadata` (e.g. `{"user_id": "u1"}`),
- pass `partition_key_name="user_id"` to your strategy and manager,
- optionally pass a `partition_key_extractor` for composite keys (see
  [`examples/composite_partition_key.py`](examples/composite_partition_key.py)).

The legacy `tenant_id` field on `VectorEmbedding` still works.

### Development

```bash
uv sync
uv run poe gate         # THE gate: lint + format check + mypy --strict + xenon A + tests ≥90% cov
uv run poe lint
uv run poe fmt          # auto-format
uv run poe fmt-check    # format check only (part of the gate)
uv run poe typecheck    # mypy --strict
uv run poe complexity   # xenon Grade A (cyclomatic ≤ 5)
uv run poe test
```

`uv run poe gate` mirrors CI exactly, both directions — if it passes locally,
CI passes. The whole public surface — not just edited code — must clear it
before a release tag is cut.

## License

MIT.
