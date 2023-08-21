"""
FiftyOne dataset-snapshot related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import re
import unittest

import bson

import fiftyone as fo
import fiftyone.core.dataset as fod

from decorators import drop_datasets


class DatasetSnapshotTests(unittest.TestCase):
    @drop_datasets
    def test_dataset_snapshots(self):
        dataset_name = self.test_dataset_snapshots.__name__
        snapshot_name = "my-snapshot"
        fo.Dataset(dataset_name)

        # Load HEAD dataset and test its name properties
        head_dataset = fo.load_dataset(dataset_name)

        def _check_head_collection(collection):
            self.assertIsNone(collection.snapshot_name)
            self.assertEqual(collection.head_name, dataset_name)
            self.assertFalse(collection.is_snapshot)
            self.assertNotIn("Snapshot:", collection.summary())

        _check_head_collection(head_dataset)
        view = head_dataset.limit(1)
        _check_head_collection(view)

        # <snapshotMagic>
        _dataset_id = str(head_dataset._doc.id)
        _internal_snapshot_name = f"_snapshot__{_dataset_id}_{snapshot_name}"
        # Create the snapshot dataset so it saves to database, but then we
        #   need to delete the singleton so the test will function properly.
        fo.Dataset(_internal_snapshot_name)
        fo.Dataset._instances.pop(_internal_snapshot_name)
        # </snapshotMagic>

        # Load snapshot dataset and test its name properties
        snapshot = fo.load_dataset(dataset_name, snapshot=snapshot_name)

        # Also try loading directly from materialized name, it should be the
        #   same instance.
        snapshot2 = fo.load_dataset(_internal_snapshot_name)
        assert snapshot2 is snapshot

        def _check_snapshot_collection(collection, summary_dataset_label):
            self.assertEqual(collection.snapshot_name, snapshot_name)
            self.assertEqual(collection.head_name, dataset_name)
            self.assertTrue(collection.is_snapshot)
            summary = collection.summary()
            snapshot_match_str = rf"Snapshot:\s+{snapshot_name}"
            self.assertTrue(bool(re.findall(snapshot_match_str, summary)))
            name_match_str = rf"{summary_dataset_label}:\s+{dataset_name}"
            self.assertTrue(bool(re.findall(name_match_str, summary)))
            self.assertNotIn(_internal_snapshot_name, summary)

        _check_snapshot_collection(snapshot, "Name")
        _check_snapshot_collection(snapshot2, "Name")
        view = snapshot.limit(1)
        view2 = snapshot2.limit(1)
        _check_snapshot_collection(view, "Dataset")
        _check_snapshot_collection(view2, "Dataset")

    def test_unknown_snapshot(self):
        dataset_name = self.test_unknown_snapshot.__name__

        head_dataset = fo.Dataset(dataset_name)

        _internal_snapshot_name = fod._snapshot_to_materialized_dataset_name(
            head_dataset._doc.id, "unknown"
        )

        # Test unknown snapshots
        self.assertRaises(ValueError, fo.load_dataset, dataset_name, "unknown")
        try:
            fo.load_dataset(dataset_name, snapshot="unknown")
        except ValueError as e:
            self.assertNotIn(_internal_snapshot_name, str(e))

        # Materialized name for unknown snapshot
        self.assertRaises(ValueError, fo.load_dataset, _internal_snapshot_name)

        # Materialized name for unknown dataset
        self.assertRaises(
            ValueError,
            fo.load_dataset,
            fod._snapshot_to_materialized_dataset_name(
                bson.ObjectId(), "unknown"
            ),
        )
