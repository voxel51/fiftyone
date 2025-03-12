"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import pytest

import fiftyone.core.map.batcher as fomb


@pytest.mark.parametrize(
    ("batch_class_key", "expected_cls"),
    (
        pytest.param(key, fomb.SampleBatcher.get(key), id=key)
        for key in fomb.SampleBatcher.available()
    ),
)
def test_split(batch_class_key, expected_cls):
    """Test method for getting samples batches"""

    with mock.patch.object(expected_cls, "split") as split:
        #####
        result = fomb.SampleBatcher.split(
            batch_class_key,
            sample_collection := mock.Mock(),
            workers := mock.Mock(),
            batch_size := mock.Mock(),
        )
        #####

        split.assert_called_once_with(sample_collection, workers, batch_size)

        assert result == split.return_value
