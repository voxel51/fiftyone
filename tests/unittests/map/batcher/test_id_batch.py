"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import pytest

import fiftyone.core.map.batcher.id_batch as fomi


@pytest.fixture(name="make_optimized_select_view")
def patch_make_view():
    """Patch method"""
    with mock.patch.object(fomi, "fov") as m:
        m.make_optimized_select_view = mock.Mock()
        yield m.make_optimized_select_view


@pytest.mark.parametrize(
    ("batch_size", "max_batch_size"),
    (
        pytest.param(None, 1024, id="implicit_batch_size"),
        pytest.param(None, 8, id="implicit_batch_size_small_max_batch_size"),
        pytest.param(8, 1024, id="explicit_batch_size"),
        pytest.param(64, 2, id="explicit_batch_size_small_max_batch_size"),
    ),
)
def test_split(sample_collection, samples, batch_size, max_batch_size):
    """test splitting sample collection into batches"""

    fomi.SampleIdBatch.get_max_batch_size = mock.Mock(
        return_value=max_batch_size
    )

    #####
    result = fomi.SampleIdBatch.split(
        sample_collection, workers := 8, batch_size
    )
    #####

    expected_batch_size = min(
        (batch_size if batch_size is not None else len(samples) // workers),
        max_batch_size,
    )
    expected_batch_count = len(samples) // expected_batch_size

    start_and_stop_idxs = [
        (i * expected_batch_size, (i + 1) * expected_batch_size)
        for i in range(expected_batch_count)
    ]

    samples_ids = [sample.id for sample in samples]

    sample_collection.values.assert_called_once_with("id")

    assert len(result) == expected_batch_count

    total = 0
    for idx, batch in enumerate(result):
        assert isinstance(batch, fomi.SampleIdBatch)
        assert batch.total == expected_batch_size
        total += batch.total

        start_idx, stop_idx = start_and_stop_idxs[idx]

        assert batch.sample_ids == tuple(samples_ids[start_idx:stop_idx])

    assert total == len(samples_ids)


def test_create_subset(sample_collection, samples, make_optimized_select_view):
    """Test converting batch into sample collection"""

    sample_ids = tuple((sample.id for sample in samples))

    batch = fomi.SampleIdBatch(*sample_ids)

    #####
    result = batch.create_subset(sample_collection)
    #####

    make_optimized_select_view.assert_called_once_with(
        sample_collection, sample_ids
    )

    assert result == make_optimized_select_view.return_value
