"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import pytest

import fiftyone.core.map.batcher.slice_batch as foms


class TestSampleSliceBatch:
    """Test splitting a sample collection into batches by slice"""

    @pytest.mark.parametrize(
        "batch_size",
        [
            pytest.param(None, id="implicit_batch_size"),
            pytest.param(8, id="explicit_batch_size"),
        ],
    )
    def test_split(self, sample_collection, samples, batch_size):
        """test splitting sample collection into batches"""

        #####
        result = foms.SampleSliceBatch.split(
            sample_collection, workers := 8, batch_size=batch_size
        )
        #####

        expected_batch_size = (
            batch_size if batch_size is not None else len(samples) // workers
        )

        expected_batch_count = (
            len(samples) // batch_size if batch_size is not None else workers
        )

        start_and_stop_idxs = [
            (i * expected_batch_size, (i + 1) * expected_batch_size)
            for i in range(expected_batch_count)
        ]

        total = 0
        for idx, batch in enumerate(result):
            assert isinstance(batch, foms.SampleSliceBatch)
            assert batch.total == expected_batch_size
            total += batch.total

            start_idx, stop_idx = start_and_stop_idxs[idx]

            assert batch.start_idx == start_idx
            assert batch.stop_idx == stop_idx

        assert total == len(samples)

    def test_create_subset(self, sample_collection):
        """test converting batch into sample collection"""
        batch = foms.SampleSliceBatch(
            start_idx := mock.Mock(), stop_idx := mock.Mock()
        )

        #####
        result = batch.create_subset(sample_collection)
        #####

        sample_collection.__getitem__.assert_called_once_with(
            slice(start_idx, stop_idx)
        )

        assert result == sample_collection.__getitem__.return_value
