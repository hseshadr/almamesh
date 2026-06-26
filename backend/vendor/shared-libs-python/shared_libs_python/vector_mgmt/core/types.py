"""Type definitions for vector management."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field

Scalar = str | int | float | bool | None
"""Permitted metadata/filter value type. Reject `Dict[str, Any]` typing for records."""

Metadata = Mapping[str, Scalar]
"""Read-only metadata or filter mapping passed across the public API surface."""


class VectorEmbedding(BaseModel):
    """Vector embedding with metadata."""

    entity_id: str
    embedding: list[float]
    tenant_id: str | None = None  # Deprecated: use metadata for partition keys.
    metadata: dict[str, Scalar] = Field(default_factory=dict)

    def get_partition_key(self, key_name: str = "tenant_id") -> str | None:
        """
        Get partition key value from embedding.

        First checks metadata[key_name], then falls back to tenant_id for backward compatibility.

        Args:
            key_name: Name of the partition key (e.g., 'tenant_id', 'user_id', 'org_id')

        Returns:
            Partition key value or None
        """
        if key_name in self.metadata:
            value = self.metadata[key_name]
            return str(value) if value is not None else None
        # Backward compatibility: if key_name is 'tenant_id', use the field
        if key_name == "tenant_id":
            return self.tenant_id
        return None


class IndexConfig(BaseModel):
    """HNSW index configuration."""

    m: int = 32
    ef_construction: int = 200
    ef_search: int = 100
    dimension: int = 1536
    distance_metric: str = "cosine"  # cosine, l2, inner_product


class IndexStats(BaseModel):
    """Index statistics."""

    index_name: str
    vector_count: int
    index_size_mb: float
    tombstone_count: int = 0
    tombstone_percentage: float = 0.0
    build_time_seconds: float | None = None
    last_rebuild_at: str | None = None


@runtime_checkable
class VectorIndex(Protocol):
    """Protocol for vector index implementations."""

    index_name: str
    config: IndexConfig

    async def insert(self, embeddings: list[VectorEmbedding]) -> None:
        """Insert embeddings into index."""
        ...

    async def search(
        self,
        query_vector: list[float],
        k: int,
        filters: Metadata | None = None,
        ef_search: int | None = None,
    ) -> list[tuple[str, float]]:
        """Search for nearest neighbors. Returns ``(entity_id, distance)`` tuples."""
        ...

    async def delete(self, entity_ids: list[str]) -> None:
        """Delete embeddings by entity_id."""
        ...

    async def get_stats(self) -> IndexStats:
        """Get index statistics."""
        ...

    async def rebuild(self, config: IndexConfig | None = None) -> None:
        """Rebuild index with optional new configuration."""
        ...


class IndexFactory(Protocol):
    """Async factory that constructs a ``VectorIndex`` for a named partition."""

    async def __call__(self, name: str, config: IndexConfig | None = None) -> VectorIndex:
        """Construct (or return) the index instance for ``name``."""
        ...
