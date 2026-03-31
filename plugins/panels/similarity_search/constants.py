"""
Similarity search panel constants.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

STORE_NAME = "similarity_search_panel"


class RunStatus:
    """Constants for similarity search run statuses."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class QueryType:
    """Constants for similarity query types."""

    TEXT = "text"
    IMAGE = "image"
