"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
import sys

import pytest

import fiftyone as fo
import fiftyone.core.map as fomm


INPUT_KEY = "input"
OUTPUT_KEY = "output"
WORKERS = 8
SAMPLE_COUNT = 3


@pytest.fixture(name="dataset")
def fixture_dataset():
    """A simple dataset to test with"""

    dataset = fo.Dataset()

    # Add samples with an "input" field
    samples = []
    for i in range(SAMPLE_COUNT):
        sample = fo.Sample(filepath=f"sample_{i}.jpg")
        sample[INPUT_KEY] = i
        samples.append(sample)

    dataset.add_samples(samples)

    try:
        yield dataset
    finally:
        dataset.delete()


@pytest.mark.parametrize("mapper_key", fomm.MapperFactory.mapper_keys())
@pytest.mark.skipif(
    sys.platform.startswith("win"),
    reason="Multiprocessing hangs when running the mapper in pytest",
)
class TestMapperImplementations:
    """test mapper implementations"""

    @pytest.fixture(name="mapper")
    def fixture_mapper(self, mapper_key):
        """Mapper instance"""
        return fomm.MapperFactory.create(mapper_key, num_workers=WORKERS)

    class TestMapSamples:
        """test Mapper.map_samples"""

        @pytest.mark.parametrize(
            "save",
            (pytest.param(v, id=f"save={v}") for v in (True, False)),
        )
        @pytest.mark.parametrize(
            "skip_failures",
            (pytest.param(v, id=f"skip_failures={v}") for v in (True, False)),
        )
        def test_map_fcn_err(self, mapper, dataset, skip_failures, save):
            """test error in map function"""
            err = Exception("Something went wrong")

            all_sample_ids = [sample.id for sample in dataset]
            err_sample_id = all_sample_ids[len(all_sample_ids) // 2]

            def map_fnc(err_sample_id):
                def inner(sample):
                    if sample.id == err_sample_id:
                        raise err

                return inner

            return_sample_ids = set()
            with contextlib.ExitStack() as ctx:
                if not skip_failures:
                    err_ctx = pytest.raises(Exception)
                    ctx.enter_context(err_ctx)

                #####
                for sample_id, _ in mapper.map_samples(
                    dataset,
                    map_fnc(err_sample_id),
                    save=save,
                    progress=False,
                    skip_failures=skip_failures,
                ):
                    #####
                    return_sample_ids.add(sample_id)

            assert err_sample_id not in return_sample_ids

            if not skip_failures:
                assert err_ctx.excinfo.type is type(err)
                assert err_ctx.excinfo.value.args == err.args

        @pytest.mark.parametrize(
            "save", (pytest.param(v, id=f"save={v}") for v in (True, False))
        )
        def test_ok(self, mapper, dataset, save):
            """test happy path"""

            def multiplied(value):
                return value * 2

            expected_output_map = {
                str(sample.id): multiplied(sample[INPUT_KEY])
                for sample in dataset.iter_samples()
            }

            def map_fcn(sample):
                sample[OUTPUT_KEY] = multiplied(sample[INPUT_KEY])
                return sample[OUTPUT_KEY]

            #####
            results = list(
                mapper.map_samples(dataset, map_fcn, save=save, progress=False)
            )
            #####

            for sample_id, output in results:
                assert output == expected_output_map[str(sample_id)]

            for sample in dataset.iter_samples():
                if save:
                    assert (
                        sample[OUTPUT_KEY]
                        == expected_output_map[str(sample.id)]
                    )
                else:
                    try:
                        expected = sample[OUTPUT_KEY]
                        assert expected is None
                    except KeyError:
                        ...


@pytest.mark.skipif(
    sys.platform.startswith("win"),
    reason="Multiprocessing hangs when running the mapper in pytest",
)
class TestInterface:
    """test the public SDK interface"""

    def test_update_samples(self, dataset):
        def update_fcn(sample):
            sample["foo"] = "bar"

        empty_view = dataset.limit(0)

        empty_view.update_samples(update_fcn, parallelize_method="process")

        assert not dataset.has_field("foo")

        dataset.update_samples(update_fcn, parallelize_method="process")

        assert dataset.has_field("foo")
        assert dataset.count_values("foo") == {"bar": SAMPLE_COUNT}

    def test_map_samples(self, dataset):
        def map_fcn(sample):
            sample["spam"] = "eggs"
            return "eggs"

        empty_view = dataset.limit(0)
        empty_generator = empty_view.map_samples(
            map_fcn,
            save=True,
            parallelize_method="process",
        )
        empty_results = [r[1] for r in empty_generator]

        assert empty_results == []
        assert not dataset.has_field("spam")

        generator = dataset.map_samples(
            map_fcn,
            save=True,
            parallelize_method="process",
        )
        results = [r[1] for r in generator]

        assert results == ["eggs"] * SAMPLE_COUNT
        assert dataset.has_field("spam")
        assert dataset.count_values("spam") == {"eggs": SAMPLE_COUNT}
