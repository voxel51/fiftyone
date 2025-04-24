"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import bson
import pytest


@pytest.fixture(name="samples")
def fixture_samples():
    """Samples returned by root sample collection"""

    def create_mock_sample():
        """Create a mock sample"""
        sample = mock.Mock()
        sample.id = bson.ObjectId()
        return sample

    return [create_mock_sample() for _ in range(128)]


@pytest.fixture(name="sample_collection")
def fixture_sample_collection(samples):
    """The mocked sample collection"""
    sample_collection = mock.Mock()

    sample_collection.__getitem__ = mock.Mock()
    sample_collection.__len__ = mock.Mock(return_value=len(samples))
    sample_collection.values.return_value = [sample.id for sample in samples]

    return sample_collection
