"""
Batch size tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone as fo
import fiftyone.core.map.process as fomp
import fiftyone.core.map.threading as fomt
from fiftyone.core.map.factory import MapperFactory


class TestBatchSize:
    """Test the batch_size parameter functionality"""

    @pytest.fixture
    def dataset(self):
        """Create a test dataset with known number of samples"""
        dataset_name = "test-batch-size-mapper"
        sample_count = 100

        dataset = fo.Dataset(name=dataset_name)
        dataset.persistent = True

        # Add samples
        for i in range(sample_count):
            sample = fo.Sample(filepath=f"/tmp/sample_{i}.jpg")
            sample["value"] = i
            dataset.add_sample(sample)

        try:
            yield dataset
        finally:
            fo.delete_dataset(dataset_name)

    @pytest.mark.parametrize(
        "mapper_type",
        [
            pytest.param("thread", id="thread-mapper"),
            pytest.param("process", id="process-mapper"),
        ],
    )
    @pytest.mark.parametrize(
        "batch_method",
        [
            pytest.param("id", id="id-batches"),
            pytest.param("slice", id="slice-batches"),
        ],
    )
    def test_small_batch_size(self, dataset, mapper_type, batch_method):
        """Test using a batch_size smaller than samples/workers"""
        sample_count = len(dataset)
        workers = 4
        batch_size = 10  # Intentionally smaller than sample_count / workers

        # Get the mapper and batch classes
        # pylint:disable-next=protected-access
        batch_cls = MapperFactory._BATCH_CLASSES[batch_method]

        # Create the mapper directly
        if mapper_type == "thread":
            mapper_cls = fomt.ThreadMapper
        else:
            mapper_cls = fomp.ProcessMapper

        # Create a mapper instance with the batch size
        mapper = mapper_cls.create(
            config=fo.config,
            batch_cls=batch_cls,
            workers=workers,
            batch_size=batch_size,
        )

        # Simple mapping function
        def double_value(sample):
            return sample["value"] * 2

        # Run the mapping operation
        results = list(
            mapper.map_samples(dataset, double_value, progress=False)
        )

        # Verify we get correct results
        assert len(results) == sample_count

        # Collect the original values from the dataset
        original_values = {
            str(sample.id): sample["value"]
            for sample in dataset.iter_samples()
        }

        # Check that each value was doubled correctly
        for sample_id, result_value in results:
            original_value = original_values[str(sample_id)]
            assert result_value == original_value * 2

    @pytest.mark.parametrize(
        "batch_method",
        [
            pytest.param("id", id="id-batches"),
            pytest.param("slice", id="slice-batches"),
        ],
    )
    def test_split_batch_size(self, dataset, batch_method):
        """Test that batch splitting creates the correct batches when using
        batch_size"""
        sample_count = len(dataset)

        test_cases = [
            # workers, batch_size, expected_num_batches
            (4, 10, 10),  # batch_size < samples/workers
            (2, 50, 2),  # batch_size = samples/workers
            (5, 100, 1),  # batch_size > samples/workers
            (
                2,
                None,
                2,
            ),  # default batch size (samples/workers = 100/2 = 50 per batch)
            (5, 33, 4),  # non-divisible batch size
        ]

        for workers, batch_size, expected_num_batches in test_cases:
            description = f"workers={workers}, batch_size={batch_size}"

            # Get the batch class and create batches
            # pylint:disable-next=protected-access
            batch_cls = MapperFactory._BATCH_CLASSES[batch_method]
            batches = batch_cls.split(dataset, workers, batch_size)

            # Verify correct number of batches
            assert (
                len(batches) == expected_num_batches
            ), f"Wrong number of batches for {description}"

            # Verify each batch has the correct size
            total_samples = 0
            for i, batch in enumerate(batches):
                # For the None case, explicitly verify the default behavior
                if batch_size is None:
                    if i < expected_num_batches - 1:
                        # In default mode, all batches except possibly the last
                        # should have size = sample_count // workers
                        assert (
                            batch.total == sample_count // workers
                        ), f"Wrong batch size for batch {i} in {description}"
                    else:
                        # Last batch might have some remainder samples
                        expected_last_batch = sample_count - (
                            expected_num_batches - 1
                        ) * (sample_count // workers)
                        assert (
                            batch.total == expected_last_batch
                        ), f"Wrong last batch size in {description}"

                total_samples += batch.total

            # Verify all samples are accounted for
            assert (
                total_samples == sample_count
            ), f"Not all samples covered in {description}"
