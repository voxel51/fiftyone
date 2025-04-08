"""
Unit tests for cache utils.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
import numpy as np
from unittest.mock import MagicMock, patch

import fiftyone as fo
from fiftyone.operators.executor import ExecutionContext
from fiftyone.operators.cache import utils


# Mock Execution Context with dataset
def create_mock_ctx():
    ctx = MagicMock(spec=ExecutionContext)
    ctx.dataset = MagicMock()
    ctx.dataset._doc.id = "mock-dataset-id"
    ctx.dataset.name = "test-dataset"
    ctx.operator_uri = "@org/plugin/operator"
    return ctx


class TestCacheUtils(unittest.TestCase):
    def test_get_function_id(self):
        def dummy():
            pass

        fid = utils._get_function_id(dummy)
        self.assertIn("dummy", fid)
        self.assertTrue(fid.startswith(dummy.__module__))

    def test_get_ctx_from_args_valid(self):
        ctx = create_mock_ctx()
        result, index = utils._get_ctx_from_args([ctx])
        self.assertEqual(result, ctx)
        self.assertEqual(index, 0)

        mock_self = {}
        result, index = utils._get_ctx_from_args([mock_self, ctx])
        self.assertEqual(result, ctx)
        self.assertEqual(index, 1)

        with self.assertRaises(ValueError):
            utils._get_ctx_from_args([])

    def test_get_ctx_from_args_invalid(self):
        with self.assertRaises(ValueError):
            utils._get_ctx_from_args(["not-a-ctx", "another-arg"])

    def test_get_ctx_idx_found(self):
        ctx = create_mock_ctx()
        result, index = utils._get_ctx_idx([ctx])
        self.assertEqual(result, ctx)
        self.assertEqual(index, 0)

    def test_get_ctx_idx_not_found(self):
        result, index = utils._get_ctx_idx(["not-a-ctx"])
        self.assertIsNone(result)
        self.assertEqual(index, -1)

    def test_resolve_store_name_default(self):
        def dummy():
            pass

        name = utils._resolve_store_name(create_mock_ctx(), dummy)
        self.assertIn("dummy", name)

    def test_resolve_store_name_with_attrs(self):
        def dummy():
            pass

        dummy.store_name = "custom.store"
        dummy.exec_cache_version = "3"

        result = utils._resolve_store_name(create_mock_ctx(), dummy)
        self.assertEqual(result, "custom.store#v3")

    def test_auto_deserialize_recursive(self):
        val = {
            "a": np.array([1, 2, 3]),
            "b": {
                "nested": np.int64(10),
                "bool": np.bool_(True),
                "float": np.float32(1.23),
            },
        }

        safe = utils.auto_deserialize(val)
        self.assertEqual(safe["a"], [1, 2, 3])
        self.assertEqual(safe["b"]["nested"], 10)
        self.assertEqual(safe["b"]["bool"], True)
        self.assertAlmostEqual(safe["b"]["float"], 1.23)

    def test_auto_deserialize_nonfinite_float_raises(self):
        with self.assertRaises(ValueError):
            utils.auto_deserialize(np.float64("inf"))

    def test_auto_deserialize_sample(self):
        filepath = "/tmp/image.jpg"
        sample = {
            "filepath": filepath,
            "ground_truth": {
                "label": "cat",
                "confidence": 0.9,
            },
            "_cls": "fiftyone.core.sample.Sample",
        }

        result = utils.auto_deserialize(sample)
        self.assertEqual(result["filepath"], filepath)
        self.assertEqual(result["ground_truth"]["label"], "cat")
        self.assertAlmostEqual(result["ground_truth"]["confidence"], 0.9)
        self.assertIsInstance(result, fo.Sample)

    def test_auto_deserialize_w_nested_samples(self):
        sample = {
            "_cls": "fiftyone.core.sample.Sample",
            "filepath": "/tmp/image.jpg",
            "ground_truth": {
                "label": "cat",
                "confidence": 0.9,
            },
            "other": [
                {
                    "filepath": "/tmp/image2.jpg",
                    "ground_truth": {
                        "label": "dog",
                        "confidence": 0.8,
                    },
                }
            ],
        }

        list_of_sample = utils.auto_deserialize([sample])
        self.assertIsInstance(list_of_sample[0], fo.Sample)
        dict_of_sample = utils.auto_deserialize({"sample": sample})
        self.assertIsInstance(dict_of_sample["sample"], fo.Sample)

    def test_auto_serialize_sample(self):
        sample = fo.Sample(
            filepath="/tmp/image.jpg",
            ground_truth=fo.Classification(label="cat"),
        )
        result = utils.auto_serialize(sample)
        self.assertIn("filepath", result)
        self.assertIn("ground_truth", result)
        self.assertIn("_cls", result)
        self.assertEqual(result["_cls"], "fiftyone.core.sample.Sample")

    def test_auto_serialize_w_nested_samples(self):
        sample = fo.Sample(
            filepath="/tmp/image.jpg",
            ground_truth=fo.Classification(label="cat"),
        )

        result = utils.auto_serialize([sample])
        self.assertEqual(result[0]["_cls"], "fiftyone.core.sample.Sample")

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_get_store_for_func_with_dataset(self, mock_create):
        ctx = create_mock_ctx()

        def func():
            pass

        func.link_to_dataset = True

        utils._get_store_for_func(ctx, func)
        mock_create.assert_called_once_with(
            store_name=utils._get_function_id(func),
            dataset_id="mock-dataset-id",
            collection_name=None,
        )

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_get_store_for_func_without_dataset(self, mock_create):
        ctx = create_mock_ctx()

        def func():
            pass

        func.link_to_dataset = False

        utils._get_store_for_func(ctx, func)
        mock_create.assert_called_once_with(
            store_name=utils._get_function_id(func),
            dataset_id=None,
            collection_name=None,
        )

    def test_build_cache_key_stable_hash(self):
        key_list = ["abc", 123]
        expected = (
            "3b568485c08a7af75fd812405efc8c23b96257acfbe45bebd50b57defd399342"
        )

        result = utils._build_cache_key(key_list)
        self.assertEqual(result, expected)

    def test_get_cache_key_list_default_behavior(self):
        ctx = create_mock_ctx()
        args = [ctx, "val1", 42]
        result = utils._get_cache_key_list(0, args, {}, key_fn=None)
        self.assertEqual(result, ["val1", 42])

    def test_get_cache_key_list_with_custom_key_fn(self):
        ctx = create_mock_ctx()
        args = [ctx]

        def custom_key_fn(ctx, *a):
            return ["custom", ctx.operator_uri]

        result = utils._get_cache_key_list(0, args, {}, key_fn=custom_key_fn)
        self.assertEqual(result, ["custom", ctx.operator_uri])

    def test_get_cache_key_list_custom_key_fn_invalid(self):
        ctx = create_mock_ctx()
        args = [ctx]

        def bad_key_fn(*a, **k):
            return "not-a-list"

        with self.assertRaises(ValueError):
            utils._get_cache_key_list(0, args, {}, key_fn=bad_key_fn)

    def test_get_cache_key_list_custom_key_fn_throws(self):
        ctx = create_mock_ctx()
        args = [ctx]

        def error_key_fn(*a, **k):
            raise RuntimeError("oops")

        with self.assertRaises(ValueError):
            utils._get_cache_key_list(0, args, {}, key_fn=error_key_fn)
