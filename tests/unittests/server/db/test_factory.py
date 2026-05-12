"""
Tests for fiftyone.server.db.factory.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest import mock

import fiftyone as fo

from fiftyone.server.db import (
    GridDataAdapter,
    get_grid_adapter,
)
from fiftyone.server.db.factory import _reset_caches_for_tests
from fiftyone.server.db.mongo import MongoGridAdapter


class TestFactory(unittest.TestCase):
    def setUp(self):
        _reset_caches_for_tests()

    def tearDown(self):
        _reset_caches_for_tests()

    def test_default_grid_backend_is_mongo(self):
        with mock.patch.object(fo.config, "grid_backend", "mongo"):
            _reset_caches_for_tests()
            adapter = get_grid_adapter()

        self.assertIsInstance(adapter, MongoGridAdapter)
        self.assertIsInstance(adapter, GridDataAdapter)

    def test_grid_backend_unknown_raises(self):
        with mock.patch.object(fo.config, "grid_backend", "banana"):
            _reset_caches_for_tests()
            with self.assertRaises(ValueError):
                get_grid_adapter()

    def test_grid_backend_case_insensitive_and_trimmed(self):
        with mock.patch.object(fo.config, "grid_backend", "  Mongo  "):
            _reset_caches_for_tests()
            adapter = get_grid_adapter()

        self.assertIsInstance(adapter, MongoGridAdapter)

    def test_grid_adapter_is_singleton_per_process(self):
        _reset_caches_for_tests()
        first = get_grid_adapter()
        second = get_grid_adapter()
        self.assertIs(first, second)


if __name__ == "__main__":
    unittest.main()
