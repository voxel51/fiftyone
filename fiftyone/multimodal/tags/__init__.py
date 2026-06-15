"""
Multimodal temporal tag SDK.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.multimodal.schemas import v1 as foms

from .temporal_tags import (
    DEFAULT_INDEX_TYPE,
    SUPPORTED_INDEX_TYPES,
    TAGS_COLLECTION_NAME,
    TEMPORAL_TAGS_EXPORT_FILENAME,
    TemporalTag,
    TemporalTagFilter,
    TemporalTags,
    add_temporal_tags,
    count_temporal_tags,
    delete_temporal_tags,
    list_temporal_tags,
    update_temporal_tag,
)

TimeTrackType = foms.TimeTrackType

__all__ = [
    "DEFAULT_INDEX_TYPE",
    "SUPPORTED_INDEX_TYPES",
    "TAGS_COLLECTION_NAME",
    "TEMPORAL_TAGS_EXPORT_FILENAME",
    "TemporalTag",
    "TemporalTagFilter",
    "TemporalTags",
    "TimeTrackType",
    "add_temporal_tags",
    "count_temporal_tags",
    "delete_temporal_tags",
    "list_temporal_tags",
    "update_temporal_tag",
]
