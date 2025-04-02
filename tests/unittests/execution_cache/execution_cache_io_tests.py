"""
Integration tests for execution_cache.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
import fiftyone as fo

from fiftyone.operators.cache import execution_cache
from fiftyone.operators.executor import ExecutionContext
from fiftyone.operators.store import ExecutionStore
from fiftyone.operators.cache.utils import build_cache_key
from decorators import drop_datasets, drop_collection

TEST_COLLECTION_NAME = "test-execution-cache"

# Cached function that queries the dataset
@execution_cache(ttl=60, collection_name=TEST_COLLECTION_NAME)
def count_samples_with_label(ctx, label):
    view = ctx.dataset.match({"ground_truth.label": label})
    return len(view), view.values("id")  # Return count + IDs for verification


def serialize_sample(sample):
    return sample.to_dict()


def deserialize_sample(sample):
    return fo.Sample.from_dict(sample)


@execution_cache(
    ttl=60,
    collection_name=TEST_COLLECTION_NAME,
    serialize=serialize_sample,
    deserialize=deserialize_sample,
)
def get_first_sample(ctx):
    return ctx.dataset.first()


def create_test_dataset():
    dataset_name = "execution_cache_samples_ds"
    dataset = fo.Dataset(dataset_name)

    dataset.add_samples(
        [
            fo.Sample(
                filepath="image1.jpg",
                ground_truth=fo.Classification(label="cat"),
            ),
            fo.Sample(
                filepath="image2.jpg",
                ground_truth=fo.Classification(label="dog"),
            ),
            fo.Sample(
                filepath="image3.jpg",
                ground_truth=fo.Classification(label="cat"),
            ),
        ]
    )
    return dataset


def setup_ctx(dataset):
    return ExecutionContext(
        request_params={
            "dataset_name": dataset.name,
            "prompt_id": "test-prompt",
        }
    )


class TestExecutionCacheWithSamples(unittest.TestCase):
    @drop_datasets
    @drop_collection(TEST_COLLECTION_NAME)
    def test_cache_query_on_dataset(self):
        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)
        count1, ids1 = count_samples_with_label(ctx, "cat")
        self.assertEqual(count1, 2)
        self.assertEqual(len(ids1), 2)

    @drop_datasets
    @drop_collection(TEST_COLLECTION_NAME)
    def test_get_first_sample(self):
        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)
        sample = get_first_sample(ctx)
        self.assertIsInstance(sample, fo.Sample)
