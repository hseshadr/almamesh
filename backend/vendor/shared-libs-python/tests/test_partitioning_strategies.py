"""Tests for partitioning strategies."""

from datetime import datetime, timedelta

import pytest

from shared_libs_python.vector_mgmt.core.types import VectorEmbedding
from shared_libs_python.vector_mgmt.partitioning.strategies import (
    BucketedPartitionStrategy,
    GlobalPartitionStrategy,
    TwoTierPartitionStrategy,
)


class TestGlobalPartitionStrategy:
    """Tests for GlobalPartitionStrategy."""

    @pytest.mark.asyncio
    async def test_get_partitions_all_to_global(self, mock_index_factory) -> None:
        """Test that all embeddings go to single global partition."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1], tenant_id="t1"),
            VectorEmbedding(entity_id="e2", embedding=[0.2], tenant_id="t2"),
        ]
        partitions = strategy.get_partitions(embeddings)
        assert len(partitions) == 1
        assert "global" in partitions
        assert len(partitions["global"]) == 2

    @pytest.mark.asyncio
    async def test_get_search_partitions_returns_global(self, mock_index_factory) -> None:
        """Test that search always returns global partition."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        partitions = strategy.get_search_partitions("tenant_1")
        assert partitions == ["global"]
        partitions = strategy.get_search_partitions(None)
        assert partitions == ["global"]

    @pytest.mark.asyncio
    async def test_get_index_creates_singleton(self, mock_index_factory) -> None:
        """Test that get_index returns same instance."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            index_name="global",
        )
        index1 = await strategy.get_index("global")
        index2 = await strategy.get_index("global")
        assert index1 is index2
        assert index1.index_name == "global"

    @pytest.mark.asyncio
    async def test_custom_partition_key_name(self, mock_index_factory) -> None:
        """Test global strategy with custom partition key name."""
        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            partition_key_name="user_id",
        )
        assert strategy.partition_key_name == "user_id"

    @pytest.mark.asyncio
    async def test_custom_partition_key_extractor(self, mock_index_factory) -> None:
        """Test global strategy with custom partition key extractor."""

        def extractor(emb: VectorEmbedding) -> str | None:
            return emb.metadata.get("custom_key")

        strategy = GlobalPartitionStrategy(
            index_factory=mock_index_factory,
            partition_key_extractor=extractor,
        )
        emb = VectorEmbedding(
            entity_id="e1",
            embedding=[0.1],
            metadata={"custom_key": "custom_value"},
        )
        key = strategy._extract_key(emb)
        assert key == "custom_value"


class TestBucketedPartitionStrategy:
    """Tests for BucketedPartitionStrategy."""

    @pytest.mark.asyncio
    async def test_get_partitions_distributes_to_buckets(self, mock_index_factory) -> None:
        """Test that embeddings are distributed across buckets."""
        strategy = BucketedPartitionStrategy(
            index_factory=mock_index_factory,
            num_buckets=4,
        )
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1], tenant_id="t1"),
            VectorEmbedding(entity_id="e2", embedding=[0.2], tenant_id="t2"),
            VectorEmbedding(entity_id="e3", embedding=[0.3], tenant_id="t3"),
        ]
        partitions = strategy.get_partitions(embeddings)
        # All embeddings should be partitioned (may be in same or different buckets)
        total = sum(len(embs) for embs in partitions.values())
        assert total == 3

    @pytest.mark.asyncio
    async def test_get_search_partitions_returns_correct_bucket(self, mock_index_factory) -> None:
        """Test that search returns correct bucket for partition key."""
        strategy = BucketedPartitionStrategy(
            index_factory=mock_index_factory,
            num_buckets=256,
        )
        partitions = strategy.get_search_partitions("tenant_123")
        assert len(partitions) == 1
        assert partitions[0].startswith("bucket_")

    @pytest.mark.asyncio
    async def test_get_search_partitions_none_key(self, mock_index_factory) -> None:
        """Test that None partition key goes to bucket 0."""
        strategy = BucketedPartitionStrategy(
            index_factory=mock_index_factory,
            num_buckets=256,
        )
        partitions = strategy.get_search_partitions(None)
        assert partitions == ["bucket_0"]

    @pytest.mark.asyncio
    async def test_get_index_creates_per_bucket(self, mock_index_factory) -> None:
        """Test that get_index creates separate indices per bucket."""
        strategy = BucketedPartitionStrategy(
            index_factory=mock_index_factory,
            num_buckets=4,
        )
        index1 = await strategy.get_index("bucket_0")
        index2 = await strategy.get_index("bucket_1")
        index3 = await strategy.get_index("bucket_0")
        assert index1 is index3  # Same bucket, same instance
        assert index1 is not index2  # Different buckets

    @pytest.mark.asyncio
    async def test_bucket_id_consistency(self, mock_index_factory) -> None:
        """Test that same partition key always maps to same bucket."""
        strategy = BucketedPartitionStrategy(
            index_factory=mock_index_factory,
            num_buckets=256,
        )
        bucket1 = strategy._get_bucket_id("tenant_123")
        bucket2 = strategy._get_bucket_id("tenant_123")
        assert bucket1 == bucket2

    @pytest.mark.asyncio
    async def test_partition_key_from_metadata(self, mock_index_factory) -> None:
        """Test that partition key is extracted from embeddings."""
        strategy = BucketedPartitionStrategy(
            index_factory=mock_index_factory,
            num_buckets=4,
            partition_key_name="user_id",
        )
        embeddings = [
            VectorEmbedding(
                entity_id="e1",
                embedding=[0.1],
                metadata={"user_id": "user_1"},
            ),
            VectorEmbedding(
                entity_id="e2",
                embedding=[0.2],
                metadata={"user_id": "user_2"},
            ),
        ]
        partitions = strategy.get_partitions(embeddings)
        total = sum(len(embs) for embs in partitions.values())
        assert total == 2


class TestTwoTierPartitionStrategy:
    """Tests for TwoTierPartitionStrategy."""

    @pytest.mark.asyncio
    async def test_get_partitions_hot_cold_split(self, mock_index_factory) -> None:
        """Test that embeddings are split into hot and cold based on date."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=30,
        )
        now = datetime.now()
        recent_date = (now - timedelta(days=10)).isoformat()
        old_date = (now - timedelta(days=40)).isoformat()

        embeddings = [
            VectorEmbedding(
                entity_id="e1",
                embedding=[0.1],
                metadata={"created_at": recent_date},
            ),
            VectorEmbedding(
                entity_id="e2",
                embedding=[0.2],
                metadata={"created_at": old_date},
            ),
        ]
        partitions = strategy.get_partitions(embeddings)
        assert "hot" in partitions
        assert "cold" in partitions
        assert len(partitions["hot"]) == 1
        assert len(partitions["cold"]) == 1
        assert partitions["hot"][0].entity_id == "e1"
        assert partitions["cold"][0].entity_id == "e2"

    @pytest.mark.asyncio
    async def test_get_partitions_no_date_defaults_to_hot(self, mock_index_factory) -> None:
        """Test that embeddings without date default to hot."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=30,
        )
        embeddings = [
            VectorEmbedding(entity_id="e1", embedding=[0.1], metadata={}),
        ]
        partitions = strategy.get_partitions(embeddings)
        assert "hot" in partitions
        assert len(partitions["hot"]) == 1

    @pytest.mark.asyncio
    async def test_get_partitions_invalid_date_defaults_to_cold(self, mock_index_factory) -> None:
        """Test that invalid date strings default to cold."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=30,
        )
        embeddings = [
            VectorEmbedding(
                entity_id="e1",
                embedding=[0.1],
                metadata={"created_at": "invalid-date"},
            ),
        ]
        partitions = strategy.get_partitions(embeddings)
        assert "cold" in partitions
        assert len(partitions["cold"]) == 1

    @pytest.mark.asyncio
    async def test_get_search_partitions_returns_both(self, mock_index_factory) -> None:
        """Test that search returns both hot and cold partitions."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=30,
        )
        partitions = strategy.get_search_partitions("tenant_1")
        assert set(partitions) == {"hot", "cold"}

    @pytest.mark.asyncio
    async def test_get_index_creates_hot_cold(self, mock_index_factory) -> None:
        """Test that get_index creates separate hot and cold indices."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=30,
        )
        hot_index = await strategy.get_index("hot")
        cold_index = await strategy.get_index("cold")
        assert hot_index.index_name == "hot_index"
        assert cold_index.index_name == "cold_index"
        assert hot_index is not cold_index

    @pytest.mark.asyncio
    async def test_get_index_unknown_partition_raises(self, mock_index_factory) -> None:
        """Test that unknown partition name raises ValueError."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=30,
        )
        with pytest.raises(ValueError, match="Unknown partition"):
            await strategy.get_index("unknown")

    @pytest.mark.asyncio
    async def test_custom_retention_days(self, mock_index_factory) -> None:
        """Test custom hot retention days."""
        strategy = TwoTierPartitionStrategy(
            index_factory=mock_index_factory,
            hot_retention_days=7,
        )
        now = datetime.now()
        recent_date = (now - timedelta(days=5)).isoformat()
        old_date = (now - timedelta(days=10)).isoformat()

        embeddings = [
            VectorEmbedding(
                entity_id="e1",
                embedding=[0.1],
                metadata={"created_at": recent_date},
            ),
            VectorEmbedding(
                entity_id="e2",
                embedding=[0.2],
                metadata={"created_at": old_date},
            ),
        ]
        partitions = strategy.get_partitions(embeddings)
        assert partitions["hot"][0].entity_id == "e1"
        assert partitions["cold"][0].entity_id == "e2"
