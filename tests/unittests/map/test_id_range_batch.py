"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import bson
import pytest

import fiftyone.core.map.batcher.id_range_batch as fomr


@pytest.fixture(name="get_id_boundaries_sync")
def patch_get_id_boundaries_sync():
    """Patch get_id_boundaries_sync"""
    with mock.patch.object(fomr, "foo") as m:
        yield m.get_id_boundaries_sync


@pytest.fixture(name="make_id_range_filter")
def patch_make_id_range_filter():
    """Patch make_id_range_filter"""
    with mock.patch.object(fomr, "foo") as m:
        yield m.make_id_range_filter


@pytest.fixture(name="db_conn")
def patch_db_conn():
    """Patch get_db_conn"""
    with mock.patch.object(fomr, "foo") as m:
        yield m.get_db_conn


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
        """test that split calls get_id_boundaries_sync and creates batches"""
        boundaries = [bson.ObjectId() for _ in range(3)]

        with mock.patch.object(fomr, "foo") as foo_mock:
            foo_mock.get_id_boundaries_sync.return_value = boundaries
            foo_mock.get_db_conn.return_value = {
                sample_collection._dataset._sample_collection_name: (
                    mock.Mock()
                )
            }

            result = fomr.SampleIdRangeBatch.split(sample_collection, 4)

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

    def test_split_with_batch_size(self, sample_collection):
        """test that batch_size controls number of partitions"""
        boundaries = [bson.ObjectId() for _ in range(3)]

        with mock.patch.object(fomr, "foo") as foo_mock:
            foo_mock.get_id_boundaries_sync.return_value = boundaries
            foo_mock.get_db_conn.return_value = {
                sample_collection._dataset._sample_collection_name: (
                    mock.Mock()
                )
            }

            # 128 samples / batch_size 32 = 4 batches
            result = fomr.SampleIdRangeBatch.split(
                sample_collection, 8, batch_size=32
            )

        assert len(result) == 4

    def test_no_boundaries_returned(self, sample_collection):
        """test fallback when get_id_boundaries_sync returns empty list"""
        with mock.patch.object(fomr, "foo") as foo_mock:
            foo_mock.get_id_boundaries_sync.return_value = []
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

    def test_unbounded(self, sample_collection):
        """test unbounded batch returns collection unchanged"""
        with mock.patch.object(fomr, "foo") as foo_mock:
            foo_mock.make_id_range_filter.return_value = None

            batch = fomr.SampleIdRangeBatch(None, None, 128)
            result = batch.create_subset(sample_collection)

        assert result is sample_collection

    def test_bounded(self, sample_collection):
        """test bounded batch calls mongo with id range filter"""
        lo = bson.ObjectId()
        hi = bson.ObjectId()
        match_stage = {"$match": {"_id": {"$gte": lo, "$lt": hi}}}

        with mock.patch.object(fomr, "foo") as foo_mock:
            foo_mock.make_id_range_filter.return_value = match_stage

            batch = fomr.SampleIdRangeBatch(lo, hi, 32)
            result = batch.create_subset(sample_collection)

        foo_mock.make_id_range_filter.assert_called_once_with(lo, hi)
        sample_collection.mongo.assert_called_once_with([match_stage])
        assert result == sample_collection.mongo.return_value
