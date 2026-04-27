"""
Similarity search panel constants.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum

STORE_NAME = "similarity_search_panel"


class RunStatus(str, Enum):
    """Statuses a similarity search run can be in."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class QueryType(str, Enum):
    """Types of similarity queries."""

    TEXT = "text"
    IMAGE = "image"
    UPLOAD = "upload"
