"""Tests for the bundled ``InMemoryVectorIndex`` reference implementation."""

from __future__ import annotations

import pytest

from shared_libs_python.vector_mgmt.core.types import IndexConfig, VectorEmbedding
from shared_libs_python.vector_mgmt.testing import (
    InMemoryVectorIndex,
    in_memory_factory,
)


@pytest.fixture
def sample_embeddings() -> list[VectorEmbedding]:
    """Three orthogonal-ish embeddings for cosine-distance assertions."""
    return [
        VectorEmbedding(
            entity_id="a",
            embedding=[1.0, 0.0, 0.0, 0.0],
            tenant_id="t1",
            metadata={"category": "x"},
        ),
        VectorEmbedding(
            entity_id="b",
            embedding=[0.0, 1.0, 0.0, 0.0],
            metadata={"tenant_id": "t2", "category": "y"},
        ),
        VectorEmbedding(
            entity_id="c",
            embedding=[0.0, 0.0, 1.0, 0.0],
            metadata={"tenant_id": "t1", "category": "y"},
        ),
    ]


async def test_factory_returns_in_memory_index() -> None:
    """The factory function constructs an ``InMemoryVectorIndex``."""
    index = await in_memory_factory("demo", IndexConfig(dimension=4))
    assert isinstance(index, InMemoryVectorIndex)
    assert index.index_name == "demo"


async def test_insert_then_search_orders_by_cosine_distance(
    sample_embeddings: list[VectorEmbedding],
) -> None:
    """Search returns the nearest embedding first, by cosine distance."""
    index = InMemoryVectorIndex("demo")
    await index.insert(sample_embeddings)

    results = await index.search([1.0, 0.0, 0.0, 0.0], k=3)
    assert [entity_id for entity_id, _ in results] == ["a", "b", "c"]
    assert results[0][1] == pytest.approx(0.0, abs=1e-6)


async def test_search_filters_by_tenant_id(
    sample_embeddings: list[VectorEmbedding],
) -> None:
    """Filtering by ``tenant_id`` resolves via metadata *or* the field."""
    index = InMemoryVectorIndex("demo")
    await index.insert(sample_embeddings)

    results = await index.search(
        [1.0, 0.0, 0.0, 0.0], k=5, filters={"tenant_id": "t1"}
    )
    assert {entity_id for entity_id, _ in results} == {"a", "c"}


async def test_search_filters_by_metadata_key(
    sample_embeddings: list[VectorEmbedding],
) -> None:
    """Filtering by a non-tenant metadata key uses metadata equality."""
    index = InMemoryVectorIndex("demo")
    await index.insert(sample_embeddings)

    results = await index.search(
        [0.0, 1.0, 0.0, 0.0], k=5, filters={"category": "y"}
    )
    assert {entity_id for entity_id, _ in results} == {"b", "c"}


async def test_delete_tombstones_entity(
    sample_embeddings: list[VectorEmbedding],
) -> None:
    """Deleted ids vanish from search and are tracked in stats."""
    index = InMemoryVectorIndex("demo")
    await index.insert(sample_embeddings)
    await index.delete(["a"])

    results = await index.search([1.0, 0.0, 0.0, 0.0], k=5)
    assert "a" not in {entity_id for entity_id, _ in results}
    stats = await index.get_stats()
    assert stats.tombstone_count == 1
    assert stats.vector_count == 2


async def test_reinserting_tombstoned_id_is_blocked(
    sample_embeddings: list[VectorEmbedding],
) -> None:
    """A tombstoned id stays dead until ``rebuild`` clears the tombstone set."""
    index = InMemoryVectorIndex("demo")
    await index.insert(sample_embeddings)
    await index.delete(["a"])
    await index.insert([sample_embeddings[0]])

    results = await index.search([1.0, 0.0, 0.0, 0.0], k=5)
    assert "a" not in {entity_id for entity_id, _ in results}


async def test_rebuild_clears_tombstones_and_adopts_config(
    sample_embeddings: list[VectorEmbedding],
) -> None:
    """``rebuild`` resets tombstones and accepts a new config."""
    index = InMemoryVectorIndex("demo", IndexConfig(dimension=4))
    await index.insert(sample_embeddings)
    await index.delete(["a", "b"])
    await index.rebuild(IndexConfig(dimension=8))

    assert index.config.dimension == 8
    stats = await index.get_stats()
    assert stats.tombstone_count == 0


async def test_search_handles_zero_norm_query() -> None:
    """A zero-norm query yields distance 1.0 (no NaN, no divide-by-zero)."""
    index = InMemoryVectorIndex("demo")
    await index.insert(
        [VectorEmbedding(entity_id="a", embedding=[1.0, 0.0, 0.0, 0.0])]
    )
    results = await index.search([0.0, 0.0, 0.0, 0.0], k=1)
    assert results == [("a", 1.0)]


async def test_get_stats_on_empty_index() -> None:
    """Empty index reports zeros, not NaN."""
    index = InMemoryVectorIndex("demo")
    stats = await index.get_stats()
    assert stats.vector_count == 0
    assert stats.tombstone_count == 0
    assert stats.tombstone_percentage == 0.0
