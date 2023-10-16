"""
Unit tests for operators/decorators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import os
import shutil
import tempfile
import unittest
from unittest import mock
from unittest.mock import patch
from fiftyone.operators.decorators import coroutine_timeout, dir_state


class DirStateTests(unittest.TestCase):
    @patch("glob.glob")
    @patch("os.path.isdir")
    def test_dir_state_non_existing_dir(self, mock_isdir, mock_glob):
        mock_isdir.return_value = False
        dirpath = "/non/existing/dir"
        try:
            result = dir_state(dirpath)
        except Exception as e:
            self.fail(e)

        self.assertIsNone(result)
        assert not mock_glob.called

    @patch("glob.glob")
    @patch("os.path.isdir")
    def test_dir_state_existing_empty_dir(self, mock_isdir, mock_glob):
        mock_isdir.return_value = True
        mock_glob.return_value = []
        dirpath = "/existing/empty/dir"

        try:
            result = dir_state(dirpath)
        except Exception as e:
            self.fail(e)
        self.assertIsNone(result)
        mock_isdir.assert_called_once_with(dirpath)
        mock_glob.assert_called_once_with(os.path.join(dirpath, "*"))

    @patch("os.path.isdir")
    @patch("glob.glob")
    @patch("os.path.getmtime")
    def test_dir_state_with_existing_nonempty_dir(
        self, mock_getmtime, mock_glob, mock_isdir
    ):
        mock_isdir.return_value = True
        mock_glob.return_value = ["file1.txt", "file2.txt"]
        mock_getmtime.side_effect = [1000, 2000]

        result = dir_state("/my/dir/path")

        self.assertEqual(result, 2000)
        mock_isdir.assert_called_once_with("/my/dir/path")
        mock_glob.assert_called_once_with(os.path.join("/my/dir/path", "*"))
        mock_getmtime.assert_has_calls(
            [unittest.mock.call("file1.txt"), unittest.mock.call("file2.txt")]
        )

    def test_dir_state_change_with_delete(self):
        plugin_paths = ["plugin1/file1.txt", "plugin2file2.txt"]
        with tempfile.TemporaryDirectory() as tmpdirname:
            initial_dir_state = dir_state(tmpdirname)
            for p in plugin_paths:
                os.makedirs(os.path.join(tmpdirname, p))

            # verify that max time is greater after adding files
            dir_state1 = dir_state(tmpdirname)
            self.assertGreater(dir_state1, initial_dir_state)

            # verify that max time is greater after deleting files
            shutil.rmtree(
                os.path.join(tmpdirname, plugin_paths[0].split("/")[0])
            )
            dir_state2 = dir_state(tmpdirname)
            self.assertGreater(dir_state2, dir_state1)


async def dummy_coroutine_fn(duration):
    await asyncio.sleep(duration)
    return "Success"


@coroutine_timeout(seconds=2)
async def timeout_dummy_coroutine_fn(duration):
    return await dummy_coroutine_fn(duration)


def non_coroutine_fn():
    pass


class TestCoroutineTimeoutDecorator(unittest.TestCase):
    def test_successful_execution(self):
        result = asyncio.run(timeout_dummy_coroutine_fn(1))
        self.assertEqual(result, "Success")

    def test_timeout_exception(self):
        with self.assertRaises(TimeoutError):
            asyncio.run(timeout_dummy_coroutine_fn(3))

    def test_non_coroutine_function(self):
        decorated_function = coroutine_timeout(2)(non_coroutine_fn)
        with self.assertRaises(TypeError):
            asyncio.run(decorated_function())
