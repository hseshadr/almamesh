"""Tests for core types."""

from shared_libs_python.vector_mgmt.core.types import IndexConfig, IndexStats, VectorEmbedding


class TestVectorEmbedding:
    """Tests for VectorEmbedding class."""

    def test_basic_creation(self) -> None:
        """Test basic embedding creation."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2, 0.3],
        )
        assert emb.entity_id == "test_1"
        assert emb.embedding == [0.1, 0.2, 0.3]
        assert emb.tenant_id is None
        assert emb.metadata == {}

    def test_with_tenant_id(self) -> None:
        """Test embedding with tenant_id field."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            tenant_id="tenant_123",
        )
        assert emb.tenant_id == "tenant_123"

    def test_with_metadata(self) -> None:
        """Test embedding with metadata."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            metadata={"key": "value", "number": 42},
        )
        assert emb.metadata == {"key": "value", "number": 42}

    def test_get_partition_key_from_metadata(self) -> None:
        """Test getting partition key from metadata."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            metadata={"user_id": "user_123"},
        )
        assert emb.get_partition_key("user_id") == "user_123"
        assert emb.get_partition_key("org_id") is None

    def test_get_partition_key_from_tenant_id_field(self) -> None:
        """Test getting partition key from tenant_id field (backward compatibility)."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            tenant_id="tenant_123",
        )
        assert emb.get_partition_key("tenant_id") == "tenant_123"

    def test_get_partition_key_metadata_overrides_field(self) -> None:
        """Test that metadata takes precedence over tenant_id field."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            tenant_id="old_tenant",
            metadata={"tenant_id": "new_tenant"},
        )
        assert emb.get_partition_key("tenant_id") == "new_tenant"

    def test_get_partition_key_none_value(self) -> None:
        """Test getting partition key when value is None."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            metadata={"user_id": None},
        )
        assert emb.get_partition_key("user_id") is None

    def test_get_partition_key_non_string_value(self) -> None:
        """Test getting partition key converts non-string to string."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            metadata={"user_id": 12345},
        )
        assert emb.get_partition_key("user_id") == "12345"

    def test_get_partition_key_custom_key_name(self) -> None:
        """Test getting partition key with custom key name."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            metadata={"org_id": "org_456", "category_id": "cat_789"},
        )
        assert emb.get_partition_key("org_id") == "org_456"
        assert emb.get_partition_key("category_id") == "cat_789"
        assert emb.get_partition_key("nonexistent") is None

    def test_get_partition_key_default_tenant_id(self) -> None:
        """Test get_partition_key defaults to tenant_id."""
        emb = VectorEmbedding(
            entity_id="test_1",
            embedding=[0.1, 0.2],
            tenant_id="tenant_default",
        )
        assert emb.get_partition_key() == "tenant_default"
        assert emb.get_partition_key("tenant_id") == "tenant_default"


class TestIndexConfig:
    """Tests for IndexConfig class."""

    def test_default_config(self) -> None:
        """Test default index configuration."""
        config = IndexConfig()
        assert config.m == 32
        assert config.ef_construction == 200
        assert config.ef_search == 100
        assert config.dimension == 1536
        assert config.distance_metric == "cosine"

    def test_custom_config(self) -> None:
        """Test custom index configuration."""
        config = IndexConfig(
            m=64,
            ef_construction=400,
            ef_search=200,
            dimension=3072,
            distance_metric="l2",
        )
        assert config.m == 64
        assert config.ef_construction == 400
        assert config.ef_search == 200
        assert config.dimension == 3072
        assert config.distance_metric == "l2"


class TestIndexStats:
    """Tests for IndexStats class."""

    def test_basic_stats(self) -> None:
        """Test basic index statistics."""
        stats = IndexStats(
            index_name="test_index",
            vector_count=1000,
            index_size_mb=50.5,
        )
        assert stats.index_name == "test_index"
        assert stats.vector_count == 1000
        assert stats.index_size_mb == 50.5
        assert stats.tombstone_count == 0
        assert stats.tombstone_percentage == 0.0

    def test_stats_with_tombstones(self) -> None:
        """Test index statistics with tombstones."""
        stats = IndexStats(
            index_name="test_index",
            vector_count=900,
            index_size_mb=45.0,
            tombstone_count=100,
            tombstone_percentage=10.0,
        )
        assert stats.tombstone_count == 100
        assert stats.tombstone_percentage == 10.0

    def test_stats_with_build_info(self) -> None:
        """Test index statistics with build information."""
        stats = IndexStats(
            index_name="test_index",
            vector_count=1000,
            index_size_mb=50.0,
            build_time_seconds=120.5,
            last_rebuild_at="2025-01-15T10:00:00Z",
        )
        assert stats.build_time_seconds == 120.5
        assert stats.last_rebuild_at == "2025-01-15T10:00:00Z"
