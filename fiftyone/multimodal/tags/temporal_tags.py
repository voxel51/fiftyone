"""
Temporal tagging support for multimodal samples.

Use :func:`add_temporal_tags`, :func:`list_temporal_tags`,
:func:`update_temporal_tag`, :func:`delete_temporal_tags`, and
:func:`count_temporal_tags` for common SDK workflows. These helpers accept a
dataset or view and delegate to
:class:`TemporalTags`, a small collection facade for ordered iteration and
bulk operations.

Temporal tags are sample-scoped records stored in the dedicated
``temporal_tags`` collection. They are removed when linked samples or datasets
are deleted, and FiftyOne dataset import/export preserves them through the
``temporal_tags.json`` sidecar. Tags may include an optional opaque ``anchor``
string that qualifies the context for their ``start`` and ``end`` values, plus
optional provenance fields describing when and by whom records were written.

Adding a temporal tag is an upsert on
``(dataset, sample, index_type, anchor, start, end, tag)``: repeated adds update
``last_modified_at`` without changing ``created_at``. Range filters use
half-open overlap semantics, so ``start=10, end=20`` matches records whose
stored interval overlaps ``[10, 20)``. Anchors participate in identity and
filtering, allowing the same tag and range to coexist under different reference
contexts.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from ._temporal_tags import (
    DEFAULT_INDEX_TYPE,
    SUPPORTED_INDEX_TYPES,
    TEMPORAL_TAGS_COLLECTION_NAME,
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

for _public_obj in (
    TemporalTag,
    TemporalTagFilter,
    TemporalTags,
    add_temporal_tags,
    count_temporal_tags,
    delete_temporal_tags,
    list_temporal_tags,
    update_temporal_tag,
):
    _public_obj.__module__ = __name__

del _public_obj

__all__ = [
    "DEFAULT_INDEX_TYPE",
    "SUPPORTED_INDEX_TYPES",
    "TEMPORAL_TAGS_EXPORT_FILENAME",
    "TEMPORAL_TAGS_COLLECTION_NAME",
    "TemporalTag",
    "TemporalTagFilter",
    "TemporalTags",
    "add_temporal_tags",
    "count_temporal_tags",
    "delete_temporal_tags",
    "list_temporal_tags",
    "update_temporal_tag",
]
