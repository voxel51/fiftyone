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
from fiftyone.operators.cache.utils import _build_cache_key
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


def setup_ctx(dataset):
    return ExecutionContext(
        request_params={
            "dataset_name": dataset.name,
            "prompt_id": "test-prompt",
        }
    )


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

    def test_ephemeral_residency(self):
        call_count = {"ephemeral": 0}

        @execution_cache(residency="ephemeral")
        def cached(ctx):
            call_count["ephemeral"] += 1
            return "ephemeral!"

        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)

        self.assertEqual(cached(ctx), "ephemeral!")
        self.assertEqual(cached(ctx), "ephemeral!")
        self.assertEqual(call_count["ephemeral"], 1)

    @drop_collection(TEST_COLLECTION_NAME)
    def test_transient_residency(self):
        call_count = {"transient": 0}

        @execution_cache(
            residency="transient", ttl=60, collection_name=TEST_COLLECTION_NAME
        )
        def cached(ctx):
            call_count["transient"] += 1
            return "transient!"

        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)

        self.assertEqual(cached(ctx), "transient!")
        self.assertEqual(cached(ctx), "transient!")
        self.assertEqual(call_count["transient"], 1)

    @drop_collection(TEST_COLLECTION_NAME)
    def test_persistent_residency(self):
        call_count = {"persistent": 0}

        @execution_cache(
            residency="persistent", collection_name=TEST_COLLECTION_NAME
        )
        def cached(ctx):
            call_count["persistent"] += 1
            return "persistent!"

        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)

        self.assertEqual(cached(ctx), "persistent!")
        self.assertEqual(cached(ctx), "persistent!")
        self.assertEqual(call_count["persistent"], 1)

    @drop_collection(TEST_COLLECTION_NAME)
    def test_hybrid_residency(self):
        call_count = {"hybrid": 0}

        @execution_cache(
            residency="hybrid", ttl=60, collection_name=TEST_COLLECTION_NAME
        )
        def cached(ctx):
            call_count["hybrid"] += 1
            return "hybrid!"

        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)

        self.assertEqual(cached(ctx), "hybrid!")
        self.assertEqual(cached(ctx), "hybrid!")
        self.assertEqual(call_count["hybrid"], 1)

    def test_invalid_residency(self):
        with self.assertRaises(ValueError):

            @execution_cache(residency="unknown")
            def bad_cached(ctx):
                return "invalid"
