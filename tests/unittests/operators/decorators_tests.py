"""
Unit tests for operators/decorators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import os
import shutil
import tempfile
import unittest
import time
from unittest.mock import MagicMock, patch

from fiftyone.operators.decorators import (
    coroutine_timeout,
    dir_state,
    execution_cache,
)


class DirStateTests(unittest.TestCase):
    def test_dir_state_non_existing_dir(self):
        dirpath = "/non/existing/dir"
        result = dir_state(dirpath)
        self.assertIsNone(result)

    @patch("os.path.isdir")
    @patch("os.path.getmtime")
    def test_dir_state_existing_empty_dir(self, mock_getmtime, mock_isdir):
        mock_isdir.return_value = True
        dirpath = "/existing/empty/dir"
        mock_getmtime.return_value = 1000
        result = dir_state(dirpath)
        mock_isdir.assert_called_once_with(dirpath)
        mock_getmtime.assert_called_once_with(dirpath)
        self.assertEqual(result, 1000)

    @patch("os.path.isdir")
    @patch("os.path.getmtime")
    def test_dir_state_with_existing_nonempty_dir(
        self, mock_getmtime, mock_isdir
    ):
        mock_isdir.return_value = True
        mock_getmtime.return_value = 2000

        result = dir_state("/my/dir/path")

        mock_isdir.assert_called_once_with("/my/dir/path")
        mock_getmtime.assert_called_once_with("/my/dir/path")
        self.assertEqual(result, 2000)

    def test_rgrs_dir_state_empty(self):
        with tempfile.TemporaryDirectory() as tmpdirname:
            self.assertNotEqual(dir_state(tmpdirname), 0)

    def test_rgrs_dir_state_change_with_delete(self):
        plugin_paths = ["@org1/plugin1", "@org2/plugin2"]
        plugin_files = ["fiftyone.yml", "plugin-code.py"]
        with tempfile.TemporaryDirectory() as tmpdirname:
            initial_dir_state = dir_state(tmpdirname)
            for p in plugin_paths:
                time.sleep(0.1)
                plugin_dir = os.path.join(tmpdirname, p)
                os.makedirs(plugin_dir)
                for plugin_file in plugin_files:
                    time.sleep(0.1)
                    fname = os.path.join(plugin_dir, plugin_file)
                    with open(fname, "a") as f:
                        f.write("test")

            # verify that max time is greater after adding files
            dir_state1 = dir_state(tmpdirname)
            self.assertNotEqual(dir_state1, initial_dir_state)

            # verify that max time is greater after deleting files
            shutil.rmtree(os.path.join(tmpdirname, plugin_paths[0]))
            dir_state2 = dir_state(tmpdirname)
            self.assertNotEqual(dir_state2, dir_state1)
            time.sleep(0.1)

            shutil.rmtree(
                os.path.join(tmpdirname, plugin_paths[1].rsplit("/", 1)[0])
            )

            dir_state3 = dir_state(tmpdirname)
            self.assertNotEqual(dir_state3, dir_state2)

    def test_rgrs_dir_state_change_with_rename(self):
        plugin_paths = ["@org1/plugin1", "@org2/plugin2"]
        plugin_files = ["fiftyone.yml", "plugin-code.py"]
        with tempfile.TemporaryDirectory() as tmpdirname:
            initial_dir_state = dir_state(tmpdirname)
            for p in plugin_paths:
                plugin_dir = os.path.join(tmpdirname, p)
                os.makedirs(plugin_dir)
                for plugin_file in plugin_files:
                    time.sleep(0.1)
                    fname = os.path.join(plugin_dir, plugin_file)
                    with open(fname, "a") as f:
                        f.write("test")

            # add wait for test to pass on older systems/python versions
            time.sleep(0.1)

            # verify that dir_state changes after adding files
            dir_state1 = dir_state(tmpdirname)
            self.assertNotEqual(dir_state1, initial_dir_state)

            # verify that dir_state is different after renaming plugin dir
            os.rename(
                os.path.join(tmpdirname, plugin_paths[0], plugin_files[1]),
                os.path.join(
                    tmpdirname, plugin_paths[0], plugin_files[1] + "renamed"
                ),
            )

            # add wait for test to pass on older systems/python versions
            time.sleep(0.2)
            dir_state2 = dir_state(tmpdirname)
            self.assertNotEqual(dir_state2, dir_state1)


async def dummy_coroutine_fn(duration):
    await asyncio.sleep(duration)
    return "Success"


@coroutine_timeout(seconds=0.2)
async def timeout_dummy_coroutine_fn(duration):
    return await dummy_coroutine_fn(duration)


def non_coroutine_fn():
    pass


class TestCoroutineTimeoutDecorator(unittest.TestCase):
    def test_successful_execution(self):
        result = asyncio.run(timeout_dummy_coroutine_fn(0.1))
        self.assertEqual(result, "Success")

    def test_timeout_exception(self):
        with self.assertRaises(TimeoutError):
            asyncio.run(timeout_dummy_coroutine_fn(0.3))

    def test_non_coroutine_function(self):
        decorated_function = coroutine_timeout(0.2)(non_coroutine_fn)
        with self.assertRaises(TypeError):
            asyncio.run(decorated_function())


# Mock Execution Context with dataset
class MockExecutionContext:
    def __init__(self):
        self.dataset = MagicMock()
        self.dataset._doc = MagicMock(id="mock_dataset_id")


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
    return f"custom-key-{a}-{b}"


@execution_cache(ttl=60, key_fn=custom_key_fn)
def function_with_custom_key(ctx, a, b):
    return a + b


class TestExecutionCacheDecorator(unittest.TestCase):
    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_function_caching(self, MockExecutionStore):
        """Test that cached function calls return the same result and avoid re-execution."""
        ctx = MockExecutionContext()
        store_instance = MockExecutionStore.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = example_function(ctx, 1, 2)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = example_function(ctx, 1, 2)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 3)
        store_instance.set.assert_called_once_with("[1, 2]", result1, ttl=60)

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_method_caching(self, MockExecutionStore):
        """Test that instance methods cache results correctly."""
        ctx = MockExecutionContext()
        obj = MockOperator()

        store_instance = MockExecutionStore.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = obj.example_method(ctx, 5, 5)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = obj.example_method(ctx, 5, 5)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 10)
        store_instance.set.assert_called_once_with("[5, 5]", result1, ttl=60)

    @patch("fiftyone.operators.store.ExecutionStore.create")
    def test_custom_key_function(self, MockExecutionStore):
        """Test that custom key functions generate expected cache keys."""
        ctx = MockExecutionContext()

        store_instance = MockExecutionStore.return_value
        store_instance.get.return_value = None  # Simulate cache miss

        result1 = function_with_custom_key(ctx, 2, 3)
        store_instance.get.return_value = result1  # Simulate cache hit
        result2 = function_with_custom_key(ctx, 2, 3)

        self.assertEqual(result1, result2)
        self.assertEqual(result1, 5)

        # Verify that the custom key function was used
        expected_key = "custom-key-2-3"
        store_instance.get.assert_called_with(expected_key)
        store_instance.set.assert_called_once_with(
            expected_key, result1, ttl=60
        )
