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
from unittest.mock import patch

from fiftyone.operators.decorators import coroutine_timeout, dir_state


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
