"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import collections
import contextlib
import random
from typing import TypeVar
from unittest import mock

import bson
import pytest

import fiftyone.core.sample as focs
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm


T = TypeVar("T")
R = TypeVar("R")

SAMPLE_COUNT = 8
NUM_WORKERS = 8


def get_random_sample_errors(n: int):
    """Get random errors for index in samples"""
    s = 0
    errors = collections.OrderedDict()
    for i in range(n):
        idx = random.randint(s, SAMPLE_COUNT - n + i)
        err = Exception(f"Something went wrong:{i}")
        errors[idx] = err
        s = idx

    return errors


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


@pytest.fixture(name="batcher")
def fixture_batcher():
    """mock batcher"""

    return mock.create_autospec(fomb.SampleBatch)


class Mapper(fomm.LocalMapper):
    """Test implementation for abstract class"""

    @classmethod
    def create(cls, *_, **__): ...

    def _map_samples_multiple_workers(self, *_, **__): ...


@pytest.mark.parametrize(
    ("expected", "map_fcn_return_value"),
    (
        pytest.param(True, mock.create_autospec(focs.Sample), id="True"),
        pytest.param(False, "not_a_sample", id="False"),
    ),
)
def test_check_if_return_is_sample(expected, map_fcn_return_value):
    """Test that check_if_return_is_sample returns False for a non-sample
    object."""
    sample_collection = mock.Mock()
    map_fcn = mock.Mock(return_value=map_fcn_return_value)

    result = fomm.check_if_return_is_sample(sample_collection, map_fcn)

    assert result is expected


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
    def mapper(self, batcher, workers):
        """Mapper instance"""
        mapper = Mapper(batcher, workers)
        # pylint:disable-next=protected-access
        mapper._map_samples_multiple_workers = mock.MagicMock()
        return mapper

    @pytest.fixture(name="map_fcn_side_effect")
    def map_fcn_side_effect(self, samples):
        """Mapper function side effect"""

        # Adding extra mock for validating check that occurs testing if the
        # map function is allowed.
        return [mock.Mock() for _ in samples]

    @pytest.fixture(name="map_fcn")
    def map_fcn(self, map_fcn_side_effect):
        """Mock  map function"""
        return mock.Mock(side_effect=map_fcn_side_effect)

    @pytest.fixture(name="map_samples_multi_worker_val")
    def map_samples_multi_worker_val(self, samples, map_fcn):
        """Private method return value"""
        return [[sample.id, None, map_fcn.return_value] for sample in samples]

    @pytest.fixture(name="map_samples_multiple_workers")
    def map_samples_multiple_workers(
        self, mapper, map_samples_multi_worker_val
    ):
        """Mock private method"""
        # pylint:disable-next=protected-access
        func = mapper._map_samples_multiple_workers
        func.return_value.__iter__.return_value = map_samples_multi_worker_val

        return func

    @pytest.mark.parametrize(
        "skip_failures",
        (pytest.param(v, id=f"skip_failures={v}") for v in (True, False)),
    )
    @pytest.mark.parametrize(
        "errors",
        (
            pytest.param(get_random_sample_errors(1), id="errors[one]"),
            pytest.param(get_random_sample_errors(3), id="errors[multiple]"),
        ),
    )
    def test_map_err(
        self,
        workers,
        skip_failures,
        errors,
        mapper,
        sample_collection,
        samples,
        map_fcn,
        map_fcn_side_effect,
        map_samples_multiple_workers,
        map_samples_multi_worker_val,
    ):
        """Test map function error"""

        for idx, err in errors.items():
            if workers == 1:
                map_fcn_side_effect[idx] = err
            else:
                map_samples_multi_worker_val[idx][1] = err

        returned_sample_ids = []
        with contextlib.ExitStack() as ctx:
            if not skip_failures:
                err_ctx = pytest.raises(Exception)
                ctx.enter_context(err_ctx)

            #####
            # Calling protected method to skip validation check on "map_fcn",
            # since thes tests rely on whether or not that mock was called a
            # certain number of times.
            # pylint: disable-next=protected-access
            for sid, _ in mapper._map_samples(
                sample_collection,
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

        if skip_failures:
            assert len(returned_sample_ids) == (SAMPLE_COUNT - len(errors))
        else:
            assert err_ctx.excinfo.value == expected_err
            assert len(returned_sample_ids) == expected_err_idx

        if workers == 1:
            assert not map_samples_multiple_workers.called

            sample_collection.iter_samples.assert_called_once_with(
                progress=progress, autosave=save
            )

            if skip_failures:
                expected_map_fcn_call_count = SAMPLE_COUNT
                expected_map_fcn_calls = [mock.call(s) for s in samples]
            else:
                expected_map_fcn_call_count = expected_err_idx + 1
                expected_map_fcn_calls = [
                    mock.call(s)
                    for i, s in enumerate(samples)
                    if i <= expected_err_idx
                ]

            assert map_fcn.call_count == expected_map_fcn_call_count
            map_fcn.assert_has_calls(expected_map_fcn_calls)

        else:
            assert not sample_collection.iter_samples.called
            assert not map_fcn.called

            map_samples_multiple_workers.assert_called_once_with(
                sample_collection,
                map_fcn,
                progress=progress,
                save=save,
                skip_failures=skip_failures,
            )

            assert not sample_collection.iter_samples.called

    def test_ok(
        self,
        workers,
        mapper,
        sample_collection,
        samples,
        map_samples_multiple_workers,
    ):
        """Test happy path"""

        #####
        results = list(
            # Calling protected method to skip validation check on "map_fcn",
            # since thes tests rely on whether or not that mock was called a
            # certain number of times.
            # pylint: disable-next=protected-access
            mapper._map_samples(
                sample_collection,
                map_fcn := mock.Mock(),
                progress=(progress := mock.Mock()),
                save=(save := mock.Mock()),
                skip_failures=(skip_failures := mock.Mock()),
            )
        )
        #####

        if workers == 1:
            assert not map_samples_multiple_workers.called

            sample_collection.iter_samples.assert_called_once_with(
                progress=progress, autosave=save
            )

            assert map_fcn.call_count == len(samples)

        else:
            assert not sample_collection.iter_samples.called
            assert not map_fcn.called

            map_samples_multiple_workers.assert_called_once_with(
                sample_collection,
                map_fcn,
                progress=progress,
                save=save,
                skip_failures=skip_failures,
            )

        assert {sample_id for sample_id, _ in results} == {
            sample.id for sample in samples
        }
