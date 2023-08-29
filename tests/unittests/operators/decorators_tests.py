"""
Unit tests for operators/decorators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
from unittest.mock import patch

from fiftyone.operators.decorators import dir_state


class DirStateTests(unittest.TestCase):
    def test_dir_state_nonexistant(self):
        dirpath = "/tmp/this/path/does/not/exist"
        glob_mock = mock.Mock(speck=glob.glob)
        try:
            dir_state(dirpath)
        except Exception as e:
            self.fail(e)

        assert not glob_mock.called

    @patch("glob.glob")
    def test_dir_state_empty(self, mock_glob):
        mock_glob.return_value = []
        with TemporaryDirectory() as d:
            dir_path = d
            try:
                dir_state(dir_path)
            except Exception as e:
                self.fail(e)

        mock_glob.assert_called_once_with(dir_path + "/*")
