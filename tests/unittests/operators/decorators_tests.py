"""
Unit tests for operators/decorators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import unittest
from unittest import mock
from unittest.mock import patch

from fiftyone.operators.decorators import dir_state


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
