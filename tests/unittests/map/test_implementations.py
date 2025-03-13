"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone as fo
import fiftyone.core.odm.database as food

import fiftyone.core.map.process as fomp
import fiftyone.core.map.threading as fomt


INPUT_KEY = "input"
OUTPUT_KEY = "output"


@pytest.fixture(name="dataset")
def fixture_dataset():
    """A simple dataset to test with"""

    dataset_name = "test-mapper"
    dataset = fo.Dataset(name=dataset_name)
    dataset.persistent = True

    # Add five samples with an "input" field
    for i in range(8):
        sample = fo.Sample(filepath=f"/tmp/sample_{i}.jpg")
        sample[INPUT_KEY] = i
        dataset.add_sample(sample)

    yield dataset

    fo.delete_dataset(dataset_name)


@pytest.mark.parametrize(
    "mapper_cls",
    (
        pytest.param(fomt.ThreadMapper, id="thread"),
        pytest.param(fomp.ProcessMapper, id="process"),
    ),
)
class TestMapperImplementations:
    """test mapper implementations"""

    @pytest.mark.parametrize(
        "save",
        (
            pytest.param(False, id="no-save"),
            pytest.param(True, id="save"),
        ),
    )
    class TestMapSamples:
        """test Mapper.map_samples"""

        def test_ok(self, mapper_cls, dataset, save):
            """test no errors"""
            mapper = mapper_cls(dataset)

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
                mapper.map_samples(map_fcn, save=save, progress=False)
            )
            #####

            for sample_id, output in results:
                assert output == expected_output_map[str(sample_id)]

            # pylint:disable-next=protected-access
            food._disconnect()
            result_dataset = fo.load_dataset(dataset.name)

            for sample in result_dataset.iter_samples():
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

    class TestUpdateSamples:
        """test Mapper.update_samples"""

        def test_ok(self, mapper_cls, dataset):
            """test no errors"""

            mapper = mapper_cls(dataset)

            def multiplied(value):
                return value * 4

            expected_output_map = {
                str(sample.id): multiplied(sample[INPUT_KEY])
                for sample in dataset.iter_samples()
            }

            def update_fcn(sample):
                sample[OUTPUT_KEY] = multiplied(sample[INPUT_KEY])

            #####
            mapper.update_samples(update_fcn)
            #####

            # pylint:disable-next=protected-access
            food._disconnect()
            result_dataset = fo.load_dataset(dataset.name)

            for sample in result_dataset.iter_samples():
                assert (
                    sample[OUTPUT_KEY] == expected_output_map[str(sample.id)]
                )
