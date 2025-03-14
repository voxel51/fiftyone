"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
import collections
import random
from unittest import mock
from typing import Callable, Iterator, List, Literal, Union, Tuple, TypeVar

import bson
import pytest


import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm


T = TypeVar("T")
R = TypeVar("R")

SAMPLE_COUNT = 128
NUM_WORKERS = 8


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
    sample_collection = mock.Mock()

    sample_collection.__getitem__ = mock.Mock()
    sample_collection.__len__ = mock.Mock(return_value=len(samples))

    sample_collection.iter_samples = mock.MagicMock()
    sample_collection.iter_samples.return_value.__iter__.return_value = samples

    sample_collection.values.return_value = [sample.id for sample in samples]

    return sample_collection


class Mapper(fomm.Mapper):
    """Test implementation for abstract class"""

    def _map_sample_batches(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        /,
        progress: Union[bool, Literal["workers"]],
        save: bool,
        halt_on_error: bool,
    ) -> Iterator[Tuple[bson.ObjectId, Union[R, Exception]]]: ...


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


@pytest.mark.parametrize(
    "workers",
    (
        pytest.param(1, id="workers[one]"),
        pytest.param(8, id="workers[multiple]"),
    ),
)
class TestMapSamples:
    """Test map samples"""

    @pytest.fixture(name="mapper")
    def mapper(self, workers, sample_collection):
        """Mapper instance"""
        mapper = Mapper(sample_collection, workers)
        # pylint:disable-next=protected-access
        mapper._map_sample_batches = mock.MagicMock()
        return mapper

    @pytest.fixture(name="map_fcn_side_effect")
    def map_fcn_side_effect(self, samples):
        """Mapper function side effect"""
        return [mock.Mock() for _ in samples]

    @pytest.fixture(name="map_fcn")
    def map_fcn(self, map_fcn_side_effect):
        """Mock  map function"""
        return mock.Mock(side_effect=map_fcn_side_effect)

    @pytest.fixture(name="map_sample_batches_value")
    def map_sample_batches_value(self, samples, map_fcn):
        """Private method return value"""
        return [[sample.id, map_fcn.return_value] for sample in samples]

    @pytest.fixture(name="map_sample_batches")
    def map_sample_batches(self, mapper, map_sample_batches_value):
        """Mock private method"""
        # pylint:disable-next=protected-access
        map_sample_batches = mapper._map_sample_batches
        map_sample_batches.return_value.__iter__.return_value = (
            map_sample_batches_value
        )

        return map_sample_batches

    @pytest.mark.parametrize(
        "skip_failures",
        (pytest.param(v, id=f"skip_failures={v}") for v in (True, False)),
    )
    @pytest.mark.parametrize(
        "error_count",
        (
            pytest.param(1, id="errors[one]"),
            pytest.param(3, id="errors[multiple]"),
        ),
    )
    def test_map_err(
        self,
        skip_failures,
        error_count,
        mapper,
        sample_collection,
        samples,
        map_fcn,
        map_fcn_side_effect,
        map_sample_batches,
        map_sample_batches_value,
    ):
        """Test map function error"""
        with mock.patch.object(fomb.SampleBatcher, "split") as split:
            sample_count = len(samples)

            # Raise errors for the appropriate samples
            s = 0
            errors = collections.OrderedDict()
            for i in range(error_count):
                idx = random.randint(s, sample_count - error_count + i)
                err = Exception(f"Something went wrong:{i}")

                errors[idx] = err
                if mapper.workers == 1:
                    map_fcn_side_effect[idx] = err
                else:
                    map_sample_batches_value[idx][1] = err

                s = idx

            returned_sample_ids = []
            with contextlib.ExitStack() as ctx:
                if not skip_failures:
                    err_ctx = pytest.raises(Exception)
                    ctx.enter_context(err_ctx)

                #####
                for sid, _ in mapper.map_samples(
                    map_fcn,
                    progress=(progress := mock.Mock()),
                    save=(save := mock.Mock()),
                    skip_failures=skip_failures,
                ):
                    returned_sample_ids.append(sid)

                #####

            expected_err_idx, expected_err = next(
                (idx, err) for idx, err in errors.items()
            )

            if not skip_failures:
                assert err_ctx.excinfo.value == expected_err

            if mapper.workers == 1:
                assert not map_sample_batches.called

                sample_collection.iter_samples.assert_called_once_with(
                    progress=progress, autosave=save
                )

                if skip_failures:
                    assert map_fcn.call_count == sample_count

                    map_fcn.assert_has_calls([mock.call(s) for s in samples])

                    assert len(
                        returned_sample_ids
                    ) == map_fcn.call_count - len(errors)
                else:
                    assert map_fcn.call_count == expected_err_idx + 1
                    map_fcn.assert_has_calls(
                        [
                            mock.call(s)
                            for i, s in enumerate(samples)
                            if i <= expected_err_idx
                        ]
                    )

                    assert len(returned_sample_ids) == map_fcn.call_count - 1

            else:
                map_sample_batches.assert_called_once_with(
                    split.return_value,
                    map_fcn,
                    progress=progress,
                    save=save,
                    halt_on_error=skip_failures,
                )

                assert not sample_collection.iter_samples.called

                assert len(returned_sample_ids) == (
                    len(map_sample_batches_value) - len(errors)
                )

    def test_ok(
        self,
        mapper,
        sample_collection,
        samples,
        map_sample_batches,
    ):
        """Test happy path"""

        with mock.patch.object(fomb.SampleBatcher, "split") as split:
            #####
            results = list(
                mapper.map_samples(
                    map_fcn := mock.Mock(),
                    progress=(progress := mock.Mock()),
                    save=(save := mock.Mock()),
                    skip_failures=(skip_failures := mock.Mock()),
                )
            )
            #####

            if mapper.workers == 1:

                sample_collection.iter_samples.assert_called_once_with(
                    progress=progress, autosave=save
                )

                map_fcn.assert_has_calls(
                    [mock.call(sample) for sample in samples]
                )

            else:
                assert not sample_collection.iter_samples.called
                assert not map_fcn.called

                map_sample_batches.assert_called_once_with(
                    split.return_value,
                    map_fcn,
                    progress=progress,
                    save=save,
                    halt_on_error=skip_failures,
                )

            assert {sample_id for sample_id, _ in results} == {
                sample.id for sample in samples
            }
