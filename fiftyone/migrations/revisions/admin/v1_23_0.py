"""
FiftyOne v1.23.0 admin revision.

Drops the temporal tag indexes that earlier versions created and that no
query uses as of v1.23.0.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from pymongo.errors import OperationFailure

import fiftyone as fo

_TAGS_COLLECTION = "tags"

_OBSOLETE_INDEXES = (
    "temporal_tag_overlap",
    "temporal_tag_sample_range",
    "temporal_tag_tag_lookup",
    "temporal_tag_counts",
)

_NAMESPACE_NOT_FOUND = 26
_INDEX_NOT_FOUND = 27


def up(db):
    collection = db[fo.config.database_name][_TAGS_COLLECTION]
    for name in _OBSOLETE_INDEXES:
        try:
            collection.drop_index(name)
        except OperationFailure as e:
            if e.code not in (_NAMESPACE_NOT_FOUND, _INDEX_NOT_FOUND):
                raise


def down(db):
    pass
