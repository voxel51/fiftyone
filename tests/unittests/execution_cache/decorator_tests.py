"""
Unit tests for fiftyone.operators.cache decorators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from unittest.mock import MagicMock, patch

from fiftyone.operators.cache import execution_cache
from fiftyone.operators.cache.utils import (
    _build_cache_key,
    _resolve_store_name,
    _get_function_id,
)
from fiftyone.operators.cache.serialization import auto_serialize
from fiftyone.operators.executor import ExecutionContext

# Mock Execution Context with dataset
def create_mock_ctx():
    ctx = MagicMock(spec=ExecutionContext)
    ctx.dataset = MagicMock()
    ctx.dataset.name = "test-dataset"
    ctx.operator_uri = "@org/plugin/operator"
    return ctx


# Default usage
@execution_cache
def example_default_cache_usage(ctx, a, b):
    return a * b


# Sample function with caching
@execution_cache(ttl=60)
def example_function(ctx, a, b):
    return a + b


# Sample class with a cached method
class MockOperator:
    @execution_cache(ttl=60)
    def example_method(self, ctx, a, b):
        return a + b


# Custom key function for testing
def custom_key_fn(ctx, a, b):
    return ["custom-key", a, b]


@execution_cache(ttl=60, key_fn=custom_key_fn)
def function_with_custom_key(ctx, a, b):
    return a + b


class NonSerializableObject:
    def __init__(self, value):
        self.value = value


class TestExecutionCacheDecorator(unittest.TestCase):
    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_default_cache_usage(self, mock_create):
        """Test that default cache usage works as expected."""
        ctx = create_mock_ctx()
        store_instance = mock_create.return_value
        store_instance.get.return_value = None
        result1 = example_default_cache_usage(ctx, 1, 2)
        store_instance.get.return_value = result1
        result2 = example_default_cache_usage(ctx, 1, 2)
        self.assertEqual(result1, result2)
        self.assertEqual(result1, 2)

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_function_caching(self, mock_create):
        """Test that cached function calls return the same result and avoid re-execution."""
        ctx = create_mock_ctx()
        store_instance = mock_create.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = example_function(ctx, 1, 2)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = example_function(ctx, 1, 2)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 3)
        store_instance.set_cache.assert_called_once_with(
            _build_cache_key([1, 2]), result1, ttl=60
        )

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_method_caching(self, mock_create):
        """Test that instance methods cache results correctly."""
        ctx = create_mock_ctx()
        obj = MockOperator()

        store_instance = mock_create.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = obj.example_method(ctx, 5, 5)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = obj.example_method(ctx, 5, 5)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 10)
        store_instance.set_cache.assert_called_once_with(
            _build_cache_key([5, 5]), result1, ttl=60
        )

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_custom_key_function(self, mock_create):
        """Test that custom key functions generate expected cache keys."""
        ctx = create_mock_ctx()

        store_instance = mock_create.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = function_with_custom_key(ctx, 2, 3)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = function_with_custom_key(ctx, 2, 3)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 5)

        # Verify that the custom key function was used
        expected_key = _build_cache_key(["custom-key", 2, 3])
        store_instance.get.assert_called_with(expected_key)
        store_instance.set_cache.assert_called_once_with(
            expected_key, result1, ttl=60
        )

    def test_missing_ctx_arg(self):
        """Test that missing ctx argument raises an error."""
        with self.assertRaises(ValueError):
            example_function()  # pylint: disable=no-value-for-parameter

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_clear_cache(self, mock_create):
        """Test that the cache can be cleared."""
        ctx = create_mock_ctx()
        example_function.clear_cache(ctx, 1, 2)
        cache_key = _build_cache_key([1, 2])
        mock_create.return_value.delete.assert_called_once_with(cache_key)

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_uncached(self, mock_create):
        """Test that un-cached functions are not cached."""
        ctx = create_mock_ctx()
        result = example_function.uncached(ctx, 1, 2)
        mock_create.assert_not_called()
        self.assertEqual(result, 3)

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_set_cache(self, mock_create):
        """Test that the cache can be set manually."""

        def my_serialize(value):
            return {"v": value.value}

        def my_deserialize(value):
            return NonSerializableObject(value=value["v"])

        @execution_cache(serialize=my_serialize, deserialize=my_deserialize)
        def my_func(ctx, value):
            return value

        ctx = create_mock_ctx()
        value = NonSerializableObject(value=42)
        my_func.set_cache(ctx, 1, 2, value)
        cache_key = _build_cache_key([1, 2])
        serialized_value = my_serialize(value)
        mock_create.return_value.set_cache.assert_called_once_with(
            cache_key, serialized_value, ttl=None
        )

    @patch("fiftyone.operators.cache.utils.ExecutionStore")
    def test_clear_all_caches(self, mock_execution_store):
        """Test that all caches can be cleared."""

        @execution_cache(ttl=60)
        def my_func():
            pass

        mock_store = MagicMock()
        mock_execution_store.create.return_value = mock_store
        function_id = _get_function_id(my_func)
        self.assertIsNotNone(function_id)
        store_name = _resolve_store_name(my_func)
        self.assertIsNotNone(store_name)
        my_func.clear_all_caches(dataset_id="mock-dataset-id")

        mock_execution_store.create.assert_called_with(
            dataset_id="mock-dataset-id",
            store_name=store_name,
            collection_name=None,
        )
        mock_store.clear_cache.assert_called_once()
