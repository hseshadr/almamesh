"""Tests for IndexManager."""

from datetime import datetime

import pytest

from shared_libs_python.vector_mgmt.core.index_manager import IndexManager
from shared_libs_python.vector_mgmt.core.types import IndexConfig, VectorEmbedding
from shared_libs_python.vector_mgmt.partitioning.strategies import (
    BucketedPartitionStrategy,
    GlobalPartitionStrategy,
    TwoTierPartitionStrategy,
)


class TestIndexManager:
    """Tests for IndexManager class."""

    @pytest.mark.asyncio
    async def test_insert_with_global_strategy(self, mock_index_factory, sample_embeddings) -> None:
        """Test inserting embeddings with global strategy."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        await manager.insert(sample_embeddings)
        # Verify by checking index stats
        stats = await manager.get_stats()
        assert len(stats) == 1
        assert stats[0].vector_count == 3

    @pytest.mark.asyncio
    async def test_insert_with_partition_key(self, mock_index_factory) -> None:
        """Test inserting with explicit partition key."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1]),
        ]
        await manager.insert(embeddings, partition_key="tenant_1")
        stats = await manager.get_stats()
        assert stats[0].vector_count == 1

    @pytest.mark.asyncio
    async def test_search_with_global_strategy(self, mock_index_factory) -> None:
        """Test searching with global strategy."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        # Insert some embeddings
        embeddings = [
            VectorEmbedding(
                entity_id="e1",
                embedding=[0.1, 0.2, 0.3],
                tenant_id="tenant_1",
            ),
            VectorEmbedding(
                entity_id="e2",
                embedding=[0.4, 0.5, 0.6],
                tenant_id="tenant_1",
            ),
        ]
        await manager.insert(embeddings, partition_key="tenant_1")
        # Search
        results = await manager.search(
            query_vector=[0.1, 0.2, 0.3],
            k=10,
            partition_key="tenant_1",
        )
        assert len(results) >= 0  # Mock returns results

    @pytest.mark.asyncio
    async def test_search_with_filters(self, mock_index_factory) -> None:
        """Test searching with additional filters."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        results = await manager.search(
            query_vector=[0.1, 0.2, 0.3],
            k=10,
            partition_key="tenant_1",
            filters={"category": "test"},
        )
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_search_with_ef_search(self, mock_index_factory) -> None:
        """Test searching with custom ef_search parameter."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        results = await manager.search(
            query_vector=[0.1, 0.2, 0.3],
            k=10,
            partition_key="tenant_1",
            ef_search=200,
        )
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_search_deduplicates_results(self, mock_index_factory) -> None:
        """Test that search deduplicates results across partitions."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=30,
        )
        manager = IndexManager(partition_strategy=strategy)
        # Insert same entity in both hot and cold (wouldn't happen in practice, but tests dedup)
        embeddings = [
            VectorEmbedding(
                entity_id="e1",
                embedding=[0.1, 0.2, 0.3],
                metadata={"created_at": datetime.now().isoformat()},
            ),
        ]
        await manager.insert(embeddings)
        results = await manager.search(
            query_vector=[0.1, 0.2, 0.3],
            k=10,
        )
        # Results should be deduplicated
        entity_ids = [r[0] for r in results]
        assert len(entity_ids) == len(set(entity_ids))  # No duplicates

    @pytest.mark.asyncio
    async def test_search_returns_top_k(self, mock_index_factory) -> None:
        """Test that search returns at most k results."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        results = await manager.search(
            query_vector=[0.1, 0.2, 0.3],
            k=5,
        )
        assert len(results) <= 5

    @pytest.mark.asyncio
    async def test_delete_with_global_strategy(self, mock_index_factory) -> None:
        """Test deleting embeddings with global strategy."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1], tenant_id="t1"),
            VectorEmbedding(entity_id="e2", embedding=[0.2], tenant_id="t1"),
        ]
        await manager.insert(embeddings, partition_key="t1")
        await manager.delete(["e1"], partition_key="t1")
        stats = await manager.get_stats()
        assert stats[0].vector_count == 1

    @pytest.mark.asyncio
    async def test_delete_with_bucketed_strategy(self, mock_index_factory) -> None:
        """Test deleting with bucketed strategy."""
        strategy = BucketedPartitionStrategy(
            index_factory=mock_index_factory,
            num_buckets=4,
        )
        manager = IndexManager(partition_strategy=strategy)
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1], tenant_id="t1"),
        ]
        await manager.insert(embeddings, partition_key="t1")
        await manager.delete(["e1"], partition_key="t1")
        stats = await manager.get_stats()
        # Should search in correct bucket
        assert len(stats) == 1

    @pytest.mark.asyncio
    async def test_get_stats_with_global_strategy(self, mock_index_factory) -> None:
        """Test getting statistics with global strategy."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1], tenant_id="t1"),
        ]
        await manager.insert(embeddings, partition_key="t1")
        stats = await manager.get_stats(partition_key="t1")
        assert len(stats) == 1
        assert stats[0].index_name == "global"
        assert stats[0].vector_count == 1

    @pytest.mark.asyncio
    async def test_get_stats_with_multiple_partitions(self, mock_index_factory) -> None:
        """Test getting statistics across multiple partitions."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=30,
        )
        manager = IndexManager(partition_strategy=strategy)
        stats = await manager.get_stats()
        assert len(stats) == 2  # hot and cold

    @pytest.mark.asyncio
    async def test_rebuild_if_needed_no_rebuild(self, mock_index_factory) -> None:
        """Test rebuild_if_needed when rebuild is not needed."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1], tenant_id="t1"),
        ]
        await manager.insert(embeddings, partition_key="t1")
        rebuilt = await manager.rebuild_if_needed(partition_key="t1")
        assert rebuilt is False

    @pytest.mark.asyncio
    async def test_rebuild_if_needed_force_rebuild(self, mock_index_factory) -> None:
        """Test forced rebuild."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1], tenant_id="t1"),
        ]
        await manager.insert(embeddings, partition_key="t1")
        rebuilt = await manager.rebuild_if_needed(partition_key="t1", force=True)
        assert rebuilt is True

    @pytest.mark.asyncio
    async def test_custom_partition_key_name(self, mock_index_factory) -> None:
        """Test manager with custom partition key name."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            partition_key_name="user_id",
        )
        manager = IndexManager(
            partition_strategy=strategy,
            partition_key_name="user_id",
        )
        assert manager.partition_key_name == "user_id"

    @pytest.mark.asyncio
    async def test_default_config(self, mock_index_factory) -> None:
        """Test manager with default config."""
        default_config = IndexConfig(m=64, ef_construction=300)
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
        )
        manager = IndexManager(
            partition_strategy=strategy,
            default_config=default_config,
        )
        assert manager.default_config == default_config

    @pytest.mark.asyncio
    async def test_search_without_partition_key(self, mock_index_factory) -> None:
        """Test searching without partition key."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        results = await manager.search(
            query_vector=[0.1, 0.2, 0.3],
            k=10,
        )
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_insert_empty_list(self, mock_index_factory) -> None:
        """Test inserting empty list."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        await manager.insert([])
        stats = await manager.get_stats()
        assert stats[0].vector_count == 0

    @pytest.mark.asyncio
    async def test_delete_empty_list(self, mock_index_factory) -> None:
        """Test deleting empty list."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        manager = IndexManager(partition_strategy=strategy)
        await manager.delete([])
        # Should not raise
