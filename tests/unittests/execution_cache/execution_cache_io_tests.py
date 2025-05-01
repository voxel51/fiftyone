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


def create_test_dataset(dataset_name="execution_cache_samples_ds"):
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

    @drop_datasets
    @drop_collection(TEST_COLLECTION_NAME)
    def test_ephemeral_residency(self):
        call_count = {"ephemeral": 0}

        @execution_cache(
            residency="ephemeral", collection_name=TEST_COLLECTION_NAME
        )
        def cached(ctx):
            call_count["ephemeral"] += 1
            return "ephemeral!"

        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)

        self.assertEqual(cached(ctx), "ephemeral!")
        self.assertEqual(cached(ctx), "ephemeral!")
        self.assertEqual(call_count["ephemeral"], 1)

    @drop_datasets
    @drop_collection(TEST_COLLECTION_NAME)
    def test_ephemeral_cache_max_size_lru_eviction(self):
        calls = []

        @execution_cache(
            residency="ephemeral",
            max_size=2,
            collection_name=TEST_COLLECTION_NAME,
        )
        def cached(ctx, arg):
            calls.append(arg)
            return f"value-{arg}"

        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)

        # Initial inserts (fills cache to max_size)
        self.assertEqual(cached(ctx, 1), "value-1")  # MISS
        self.assertEqual(cached(ctx, 2), "value-2")  # MISS

        # Re-accessing existing key (1) should not cause eviction
        self.assertEqual(cached(ctx, 1), "value-1")  # HIT

        # Adding a new key (3) should evict key 2 (LRU)
        self.assertEqual(cached(ctx, 3), "value-3")  # MISS, evicts 2

        # Now:
        # 1 → should be in cache (most recently used)
        # 3 → just added
        # 2 → should be evicted, so it triggers a call
        self.assertEqual(cached(ctx, 2), "value-2")  # MISS again

        # Calls should reflect actual cache misses only
        self.assertEqual(calls, [1, 2, 3, 2])

    @drop_datasets
    @drop_collection(TEST_COLLECTION_NAME)
    def test_transient_cache_hits_in_memory(self):
        calls = []

        @execution_cache(
            residency="transient", ttl=60, collection_name=TEST_COLLECTION_NAME
        )
        def cached(ctx, tag):
            calls.append(tag)
            return f"transient-{tag}"

        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)

        # Cache miss
        self.assertEqual(cached(ctx, "a"), "transient-a")

        # Same input, cache hit
        self.assertEqual(cached(ctx, "a"), "transient-a")

        # Only one call should have been made
        self.assertEqual(calls, ["a"])

    @drop_datasets
    @drop_collection(TEST_COLLECTION_NAME)
    def test_hybrid_cache_combines_memory_and_disk(self):
        calls = []

        @execution_cache(
            residency="hybrid", ttl=60, collection_name=TEST_COLLECTION_NAME
        )
        def cached(ctx, tag):
            calls.append(tag)
            return f"hybrid-{tag}"

        dataset = create_test_dataset()
        ctx = setup_ctx(dataset)

        self.assertEqual(cached(ctx, "c"), "hybrid-c")  # MISS
        self.assertEqual(cached(ctx, "c"), "hybrid-c")  # HIT

        self.assertEqual(calls, ["c"])

    def test_invalid_residency_raises_value_error(self):
        with self.assertRaises(ValueError):

            @execution_cache(residency="wat")
            def bad(ctx, tag):
                return f"nope-{tag}"

    @drop_collection(TEST_COLLECTION_NAME)
    @drop_datasets
    def test_clear_cache_ephemeral(self):
        self._run_clear_cache_test("ephemeral", clear_fn="per_key")

    @drop_collection(TEST_COLLECTION_NAME)
    @drop_datasets
    def test_clear_cache_hybrid(self):
        self._run_clear_cache_test("hybrid", clear_fn="per_key")

    @drop_collection(TEST_COLLECTION_NAME)
    @drop_datasets
    def test_clear_cache_transient(self):
        self._run_clear_cache_test("transient", clear_fn="per_key")

    def _run_clear_cache_test(self, residency, clear_fn):
        dataset_name = f"execution_cache_samples_ds_{residency}"
        calls = []

        @execution_cache(
            collection_name=TEST_COLLECTION_NAME, residency=residency
        )
        def cached(ctx, tag):
            calls.append(tag)
            return f"tag-{tag}"

        dataset = create_test_dataset(dataset_name=dataset_name)
        ctx = setup_ctx(dataset)

        self.assertEqual(cached(ctx, residency), f"tag-{residency}")

        if clear_fn == "per_key":
            cached.clear_cache(ctx, residency)
        elif clear_fn == "all":
            cached.clear_all_caches(ctx=ctx)
        else:
            raise ValueError(f"Unknown clear_fn mode: {clear_fn}")

        self.assertEqual(cached(ctx, residency), f"tag-{residency}")
        self.assertEqual(calls, [residency, residency])

        fo.delete_dataset(dataset_name)
