"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import fiftyone.core.map as focm
import fiftyone.core.view as fov

import bson
import pytest

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


class TestSplitSampleCollection:
    """Test splitting a sample collection"""

    @pytest.fixture(name="make_optimized_select_view")
    def patch_make_view(self):
        """Patch method"""
        with mock.patch.object(fov, "make_optimized_select_view") as m:
            yield m

    @pytest.mark.parametrize(
        "shard_size",
        [
            pytest.param(None, id="implicit_shard_size"),
            pytest.param(8, id="explicit_shard_size"),
        ],
    )
    def test_slice(self, sample_collection, samples, shard_size):
        """test slice shard method"""

        mapper = focm.ThreadingMapBackend(SAMPLE_COUNT)

        #####
        result = mapper.split_sample_collection(
            sample_collection, NUM_WORKERS, "slice", shard_size
        )
        #####

        expected_shard_size = (
            shard_size
            if shard_size is not None
            else len(samples) // NUM_WORKERS
        )

        expected_shard_count = (
            len(samples) // shard_size
            if shard_size is not None
            else NUM_WORKERS
        )

        sample_collection.__getitem__.assert_has_calls(
            [
                mock.call(
                    slice(
                        i * expected_shard_size,
                        (i + 1) * expected_shard_size,
                        None,
                    )
                )
                for i in range(expected_shard_count)
            ]
        )

        assert result == [
            (sample_collection.__getitem__.return_value, expected_shard_size)
            for _ in range(expected_shard_count)
        ]

    @pytest.mark.parametrize(
        ("shard_size", "max_shard_size"),
        (
            pytest.param(None, SAMPLE_COUNT, id="implicit_shard_size"),
            pytest.param(
                None, 8, id="implicit_shard_size_small_max_shard_size"
            ),
            pytest.param(8, SAMPLE_COUNT, id="explicit_shard_size"),
            pytest.param(64, 2, id="explicit_shard_size_small_max_shard_size"),
        ),
    )
    def test_id(
        self,
        sample_collection,
        samples,
        shard_size,
        max_shard_size,
        make_optimized_select_view,
    ):
        """test id shard method"""

        mapper = focm.ThreadingMapBackend(max_shard_size)

        #####
        result = mapper.split_sample_collection(
            sample_collection, NUM_WORKERS, "id", shard_size
        )
        #####

        expected_shard_size = min(
            (
                shard_size
                if shard_size is not None
                else len(samples) // NUM_WORKERS
            ),
            max_shard_size,
        )
        expected_shard_count = len(samples) // expected_shard_size

        sample_ids = [samples.id for samples in samples]

        assert sample_collection.values.called

        make_optimized_select_view.assert_has_calls(
            [
                mock.call(
                    sample_collection,
                    sample_ids[
                        i * expected_shard_size : (i + 1) * expected_shard_size
                    ],
                )
                for i in range(expected_shard_count)
            ]
        )

        assert result == [
            (make_optimized_select_view.return_value, expected_shard_size)
            for _ in range(expected_shard_count)
        ]


class TestParallelizeSamples:
    """Test parallelizing a sample collection map"""

    # def test_err(self): ...

    def test_ok(self, sample_collection, samples):
        """Test happy path"""
        shard_size = len(samples) // NUM_WORKERS
        split_sample_collections_res = [
            (
                create_mock_sample_collection(
                    samples[i * shard_size : (i + 1) * shard_size]
                ),
                shard_size,
            )
            for i in range(NUM_WORKERS)
        ]

        mapper = focm.ThreadingMapBackend(mock.Mock())
        mapper.split_sample_collection = mock.Mock(
            return_value=split_sample_collections_res
        )

        #####
        result = list(
            mapper.parallelize_samples(
                sample_collection,
                map_fcn := mock.Mock(),
                NUM_WORKERS,
                shard_method=(shard_method := mock.Mock()),
                save=(save := mock.Mock()),
            )
        )
        #####

        mapper.split_sample_collection.assert_called_once_with(
            sample_collection, NUM_WORKERS, shard_method
        )

        for split_sample_collection, _ in split_sample_collections_res:
            split_sample_collection.iter_samples.assert_called_once_with(
                autosave=save
            )

        map_fcn.assert_has_calls(
            [mock.call(sample) for sample in samples], any_order=True
        )

        assert result == [
            (sample.id, map_fcn.return_value) for sample in samples
        ]

    def test_ok_num_one_worker(self, sample_collection, samples):
        """Test happy path with one worker"""

        mapper = focm.ThreadingMapBackend(mock.Mock())
        mapper.split_sample_collection = mock.Mock()

        #####
        result = list(
            mapper.parallelize_samples(
                sample_collection,
                map_fcn := mock.Mock(),
                1,
                shard_method=mock.Mock(),
                save=mock.Mock(),
            )
        )
        #####

        assert not mapper.split_sample_collection.called

        map_fcn.assert_has_calls(
            [mock.call(sample) for sample in samples], any_order=True
        )

        assert result == [
            (sample.id, map_fcn.return_value) for sample in samples
        ]
