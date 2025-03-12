"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock
from typing import Callable, List, Literal, Union, TypeVar

import bson
import pytest


import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm


T = TypeVar("T")
R = TypeVar("R")

SAMPLE_COUNT = 128
NUM_WORKERS = 8


def create_mock_sample_collection(samples):
    """Create a mock sample collection"""
    sample_collection = mock.Mock()

    sample_collection.__getitem__ = mock.Mock()
    sample_collection.__len__ = mock.Mock(return_value=len(samples))

    sample_collection.iter_samples = mock.MagicMock()
    sample_collection.iter_samples.return_value.__iter__.return_value = samples

    sample_collection.values.return_value = [sample.id for sample in samples]

    return sample_collection


@pytest.fixture(name="samples")
def fixture_samples():
    """Samples returned by root sample collection"""

    def create_mock_sample():
        """Create a mock sample"""
        sample = mock.Mock()
        sample.id = bson.ObjectId()
        return sample

    return [create_mock_sample() for _ in range(SAMPLE_COUNT)]


@pytest.fixture(name="sample_collection")
def fixture_sample_collection(samples):
    """The mocked root sample collection"""
    return create_mock_sample_collection(samples)


class Mapper(fomm.Mapper):
    """Test implementation for abstract class"""

    def _map_samples_parallel(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        progress: Union[bool, Literal["workers"]],
        save: bool = False,
    ): ...


class TestConstructor:
    """test generic constructor"""

    @pytest.mark.parametrize(
        ("workers_arg", "expected_workers"),
        (
            pytest.param(None, 1, id="worker-is-unset"),
            pytest.param(5, 5, id="worker-is-set"),
        ),
    )
    def test_workers(self, workers_arg, expected_workers, sample_collection):
        """test worker value"""

        #####
        mapper = Mapper(sample_collection, workers_arg)
        #####

        assert mapper.workers == expected_workers


class TestMapSamples:
    """Test map samples"""

    def test_ok_one_worker(self, sample_collection, samples):
        """Test happy path with one worker"""
        mapper = Mapper(sample_collection, 1)

        #####
        results = list(
            mapper.map_samples(
                map_fcn := mock.Mock(),
                save := mock.Mock(),
                progress := mock.Mock(),
            )
        )
        #####

        sample_collection.iter_samples.assert_called_once_with(
            progress=progress, autosave=save
        )

        map_fcn.assert_has_calls([mock.call(sample) for sample in samples])

        assert results == [
            (sample.id, map_fcn.return_value) for sample in samples
        ]

    def test_ok_multiple_workers(self, sample_collection, samples):
        """Test happy path with multiple workers"""

        mapper = Mapper(sample_collection, 8)

        # pylint:disable-next=protected-access
        map_samples_parallel = mapper._map_samples_parallel = mock.MagicMock()

        map_samples_parallel.return_value.__iter__.return_value = samples

        with mock.patch.object(fomb.SampleBatcher, "split") as split:
            #####
            results = list(
                mapper.map_samples(
                    map_fcn := mock.Mock(),
                    save := mock.Mock(),
                    progress := mock.Mock(),
                )
            )
            #####

            assert not sample_collection.iter_samples.called
            assert not map_fcn.called

            map_samples_parallel.assert_called_once_with(
                split.return_value, map_fcn, progress, save
            )

            assert (
                results
                == map_samples_parallel.return_value.__iter__.return_value
            )
