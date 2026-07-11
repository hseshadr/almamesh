"""Shared libraries for Python projects.

This package contains reusable libraries for various purposes.
Currently includes vector_mgmt for HNSW vector indexing and partitioning.
"""

__version__ = "0.1.2"

# Re-export vector_mgmt for backward compatibility and convenience
# Package exports
from shared_libs_python import vector_mgmt
from shared_libs_python.vector_mgmt import (
    BucketedPartitionStrategy,
    GlobalPartitionStrategy,
    IndexConfig,
    IndexManager,
    IndexStats,
    PartitionStrategy,
    TwoTierPartitionStrategy,
    VectorEmbedding,
    VectorIndex,
)

__all__ = [
    "BucketedPartitionStrategy",
    "GlobalPartitionStrategy",
    "IndexConfig",
    "IndexManager",
    "IndexStats",
    "PartitionStrategy",
    "TwoTierPartitionStrategy",
    "VectorEmbedding",
    "VectorIndex",
    "vector_mgmt",
]
