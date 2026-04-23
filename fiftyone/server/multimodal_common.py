"""
Shared multimodal backend constants and contracts.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

_CATALOG_VERSION = "multimodal-workspace-v5"
_DEFAULT_SIDEBAR_WIDTH = 208
_MIN_SIDEBAR_WIDTH = 176
_MAX_SIDEBAR_WIDTH = 420
_DEFAULT_SOURCE_KIND = "mcap"
_DEFAULT_STREAM = {
    "kind": "other",
    "affordances": [],
    "compatible_panels": [],
    "location_mode": None,
}
_DEFAULT_IMAGE_PANEL_LIMIT = 3
_PREFERRED_IMAGE_PANEL_TOKENS = ("front", "left", "right")
_PREFERRED_GLOBAL_FRAME_IDS = ("odom", "map", "world")
_PREFERRED_EGO_FRAME_IDS = (
    "base_link",
    "ego_vehicle",
    "ego",
    "vehicle",
)
_DEFAULT_BOOTSTRAP_TRANSFORM_WINDOW_NS = 1_000_000_000
_DEFAULT_BOOTSTRAP_RENDER_MESSAGE_COUNT = 2
_TIMELINE_INDEX_CACHE_MAX_ENTRIES = 4
_TIMELINE_INDEX_CACHE_TTL_SECONDS = 300
_STREAM_WINDOW_BINARY_CACHE_MAX_ENTRIES = 16
_STREAM_WINDOW_BINARY_CACHE_TTL_SECONDS = 120
_TIMELINE_INDEX_ARTIFACTS_SUBDIR = os.path.join(
    "var", "multimodal", "timeline_indexes"
)
MULTIMODAL_RAW_BUFFER_BINARY_CONTENT_TYPE = (
    "application/x-fiftyone-multimodal-raw-buffer"
)
_MULTIMODAL_RAW_BUFFER_BINARY_MAGIC = b"MMRB"
_MULTIMODAL_RAW_BUFFER_BINARY_VERSION = 1


class MultimodalError(Exception):
    """Base class for multimodal service exceptions."""


class MultimodalDependencyError(MultimodalError):
    """Raised when a multimodal runtime dependency is unavailable."""


class MultimodalRouteError(MultimodalError):
    """Raised when the request cannot be fulfilled as specified."""

    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class PersistedMultimodalWorkspaceState:
    """Persisted multimodal workspace state loaded from a sample."""

    def __init__(self, metadata=None, rendering_plan=None):
        self.metadata = metadata
        self.rendering_plan = rendering_plan


class MultimodalIngestArtifacts:
    """Catalog and persisted ingest artifacts for a multimodal source."""

    def __init__(self, metadata, timeline_indexes):
        self.metadata = metadata
        self.timeline_indexes = timeline_indexes
