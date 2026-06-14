"""
FiftyOne Server dataset utility unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest
from bson import ObjectId
from starlette.exceptions import HTTPException

import fiftyone as fo

from fiftyone.server.utils.datasets import (
    get_dataset,
    get_sample_from_dataset,
)


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a persistent dataset for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


class TestGetDataset:
    """Tests for get_dataset utility function."""

    def test_get_dataset_by_name(self, dataset):
        """Tests loading a dataset by name."""
        result = get_dataset(dataset.name)
        assert result.name == dataset.name

    def test_get_dataset_not_found(self):
        """Tests that HTTPException is raised for non-existent dataset."""
        with pytest.raises(HTTPException) as exc_info:
            get_dataset("non_existent_dataset_12345")

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail


class TestGetSampleFromDataset:
    """Tests for get_sample_from_dataset utility function."""

    def test_get_sample_success(self, dataset):
        """Tests successfully retrieving a sample."""
        sample = fo.Sample(filepath="/tmp/test.jpg")
        dataset.add_sample(sample)

        result = get_sample_from_dataset(dataset, str(sample.id))
        assert result.id == sample.id

    def test_get_sample_not_found(self, dataset):
        """Tests that HTTPException is raised for non-existent sample."""
        bad_id = str(ObjectId())

        with pytest.raises(HTTPException) as exc_info:
            get_sample_from_dataset(dataset, bad_id)

        assert exc_info.value.status_code == 404
        assert bad_id in exc_info.value.detail
