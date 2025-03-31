"""
Unit tests for operators/decorators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from unittest.mock import MagicMock, patch

from fiftyone.operators.cache import execution_cache
from fiftyone.operators.cache.utils import build_cache_key
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


class TestExecutionCacheDecorator(unittest.TestCase):
    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_default_cache_usage(self, MockExecutionStore):
        """Test that default cache usage works as expected."""
        ctx = create_mock_ctx()
        store_instance = MockExecutionStore.return_value
        store_instance.get.return_value = None
        result1 = example_default_cache_usage(ctx, 1, 2)
        store_instance.get.return_value = result1
        result2 = example_default_cache_usage(ctx, 1, 2)
        self.assertEqual(result1, result2)
        self.assertEqual(result1, 2)

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_function_caching(self, MockExecutionStore):
        """Test that cached function calls return the same result and avoid re-execution."""
        ctx = create_mock_ctx()
        store_instance = MockExecutionStore.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = example_function(ctx, 1, 2)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = example_function(ctx, 1, 2)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 3)
        store_instance.set_cache.assert_called_once_with(
            build_cache_key([1, 2]), result1, ttl=60
        )

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_method_caching(self, MockExecutionStore):
        """Test that instance methods cache results correctly."""
        ctx = create_mock_ctx()
        obj = MockOperator()

        store_instance = MockExecutionStore.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = obj.example_method(ctx, 5, 5)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = obj.example_method(ctx, 5, 5)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 10)
        store_instance.set_cache.assert_called_once_with(
            build_cache_key([5, 5]), result1, ttl=60
        )

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_custom_key_function(self, MockExecutionStore):
        """Test that custom key functions generate expected cache keys."""
        ctx = create_mock_ctx()

        store_instance = MockExecutionStore.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = function_with_custom_key(ctx, 2, 3)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = function_with_custom_key(ctx, 2, 3)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 5)

        # Verify that the custom key function was used
        expected_key = build_cache_key(["custom-key", 2, 3])
        store_instance.get.assert_called_with(expected_key)
        store_instance.set_cache.assert_called_once_with(
            expected_key, result1, ttl=60
        )

    def test_missing_ctx_arg(self):
        """Test that missing ctx argument raises an error."""
        with self.assertRaises(ValueError):
            example_function()  # pylint: disable=no-value-for-parameter
