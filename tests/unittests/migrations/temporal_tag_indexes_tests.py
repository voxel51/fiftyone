"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib
import unittest
from unittest import mock

from pymongo import ASCENDING

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.tags as fota
from decorators import drop_datasets, isolate_temporal_tags

revision = importlib.import_module(
    "fiftyone.migrations.revisions.admin.v1_23_0"
)


def _keys(*fields):
    return [(field, ASCENDING) for field in fields]


class TemporalTagIndexRevisionTests(unittest.TestCase):
    @isolate_temporal_tags
    @drop_datasets
    def test_up_drops_only_the_obsolete_indexes(self):
        dataset = fo.Dataset()
        fota.list_temporal_tags(dataset)

        collection = foo.get_db_conn()[fota.TAGS_COLLECTION_NAME]
        current = set(collection.index_information())

        # What v1.22.0 created, beside the indexes still in use
        collection.create_index(
            _keys(
                "_dataset_id",
                "_sample_id",
                "kind",
                "index_type",
                "anchor",
                "start",
                "end",
            ),
            name="temporal_tag_overlap",
        )
        collection.create_index(
            _keys(
                "_dataset_id",
                "_sample_id",
                "kind",
                "start",
                "end",
                "index_type",
                "anchor",
                "tag",
            ),
            name="temporal_tag_sample_range",
        )
        collection.create_index(
            _keys(
                "_dataset_id",
                "kind",
                "tag",
                "_sample_id",
                "start",
                "end",
                "index_type",
                "anchor",
            ),
            name="temporal_tag_tag_lookup",
        )
        collection.create_index(
            _keys("_dataset_id", "kind", "anchor", "tag"),
            name="temporal_tag_counts",
        )

        client = foo.get_db_client()
        with mock.patch.object(
            revision, "_TAGS_COLLECTION", fota.TAGS_COLLECTION_NAME
        ):
            revision.up(client)
            self.assertEqual(set(collection.index_information()), current)

            # Already dropped
            revision.up(client)
            self.assertEqual(set(collection.index_information()), current)

        # No tags collection at all
        with mock.patch.object(
            revision, "_TAGS_COLLECTION", fota.TAGS_COLLECTION_NAME + "_absent"
        ):
            revision.up(client)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
