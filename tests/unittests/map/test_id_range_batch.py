"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import bson
import pytest

import fiftyone.core.map.batcher.id_range_batch as fomr


class TestSplit:
    """Test splitting a sample collection into id range batches"""

    def test_empty_collection(self, sample_collection):
        """test empty collection returns no batches"""
        sample_collection.__len__ = mock.Mock(return_value=0)

        result = fomr.SampleIdRangeBatch.split(sample_collection, 4)

        assert result == []

    def test_single_partition(self, sample_collection):
        """test single partition when num_workers=1"""
        result = fomr.SampleIdRangeBatch.split(sample_collection, 1)

        assert len(result) == 1
        assert result[0].lo is None
        assert result[0].hi is None
        assert result[0].total == 128

    def test_split_uses_boundaries(self, sample_collection):
        """test that split calls get_id_boundaries and creates batches
        with correct lo/hi from the returned boundaries"""
        boundaries = [bson.ObjectId() for _ in range(3)]

        with mock.patch.object(fomr, "foo") as foo_mock:
            foo_mock.get_id_boundaries.return_value = boundaries
            foo_mock.get_db_conn.return_value = {
                sample_collection._dataset._sample_collection_name: (
                    mock.Mock()
                )
            }

            result = fomr.SampleIdRangeBatch.split(sample_collection, 4)

        # 3 boundaries -> 4 partitions: [None, b0), [b0, b1), [b1, b2), [b2, None)
        assert len(result) == 4
        assert result[0].lo is None
        assert result[0].hi == boundaries[0]
        assert result[1].lo == boundaries[0]
        assert result[1].hi == boundaries[1]
        assert result[2].lo == boundaries[1]
        assert result[2].hi == boundaries[2]
        assert result[3].lo == boundaries[2]
        assert result[3].hi is None

        total = sum(b.total for b in result)
        assert total == 128

    def test_batch_size_controls_num_partitions(self, sample_collection):
        """test that batch_size determines how many partitions are requested"""
        boundaries = [bson.ObjectId() for _ in range(3)]

        with mock.patch.object(fomr, "foo") as foo_mock:
            foo_mock.get_id_boundaries.return_value = boundaries
            collection_mock = mock.Mock()
            foo_mock.get_db_conn.return_value = {
                sample_collection._dataset._sample_collection_name: (
                    collection_mock
                )
            }

            # 128 samples / batch_size 32 = 4 partitions
            fomr.SampleIdRangeBatch.split(sample_collection, 8, batch_size=32)

        # Verify get_id_boundaries was called with n_partitions=4
        foo_mock.get_id_boundaries.assert_called_once_with(collection_mock, 4)

    def test_no_boundaries_falls_back_to_single(self, sample_collection):
        """test fallback to single partition when DB returns no boundaries"""
        with mock.patch.object(fomr, "foo") as foo_mock:
            foo_mock.get_id_boundaries.return_value = []
            foo_mock.get_db_conn.return_value = {
                sample_collection._dataset._sample_collection_name: (
                    mock.Mock()
                )
            }

            result = fomr.SampleIdRangeBatch.split(sample_collection, 4)

        assert len(result) == 1
        assert result[0].lo is None
        assert result[0].hi is None


class TestCreateSubset:
    """Test creating a subset from an id range batch"""

    def test_unbounded_returns_collection(self, sample_collection):
        """test that an unbounded batch (lo=None, hi=None) returns the
        original collection without calling mongo()"""
        batch = fomr.SampleIdRangeBatch(None, None, 128)
        result = batch.create_subset(sample_collection)

        assert result is sample_collection
        sample_collection.mongo.assert_not_called()

    def test_bounded_applies_id_range_filter(self, sample_collection):
        """test that a bounded batch sets _prefix with the correct
        _id range $match stage on the view"""
        lo = bson.ObjectId()
        hi = bson.ObjectId()

        view = mock.Mock()
        view._pipeline.return_value = []
        sample_collection.view.return_value = view

        batch = fomr.SampleIdRangeBatch(lo, hi, 32)
        result = batch.create_subset(sample_collection)

        expected = {"$match": {"_id": {"$gte": lo, "$lt": hi}}}
        assert result is view
        assert view._prefix == [expected]
        assert view._hint == {"_id": 1}

    def test_last_partition_has_no_upper_bound(self, sample_collection):
        """test the last partition (lower bound only, no upper bound)
        produces a $gte-only filter"""
        lower = bson.ObjectId()

        view = mock.Mock()
        view._pipeline.return_value = []
        sample_collection.view.return_value = view

        batch = fomr.SampleIdRangeBatch(lower, None, 32)
        result = batch.create_subset(sample_collection)

        expected = {"$match": {"_id": {"$gte": lower}}}
        assert result is view
        assert view._prefix == [expected]
