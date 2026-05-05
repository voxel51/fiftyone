"""
Tests for fiftyone.server.db.factory.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import unittest
from unittest import mock

from fiftyone.server.db import (
    GridDataAdapter,
    MetadataAdapter,
    get_grid_adapter,
    get_metadata_adapter,
)
from fiftyone.server.db.factory import _reset_caches_for_tests
from fiftyone.server.db.mongo import (
    MongoGridAdapter,
    MongoMetadataAdapter,
)
from fiftyone.server.db.sql import SQLGridAdapter


class TestFactory(unittest.TestCase):
    def setUp(self):
        _reset_caches_for_tests()

    def tearDown(self):
        _reset_caches_for_tests()

    def test_default_grid_backend_is_mongo(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("FIFTYONE_GRID_BACKEND", None)
            _reset_caches_for_tests()
            adapter = get_grid_adapter()

        self.assertIsInstance(adapter, MongoGridAdapter)
        self.assertIsInstance(adapter, GridDataAdapter)

    def test_grid_backend_mongo(self):
        with mock.patch.dict(os.environ, {"FIFTYONE_GRID_BACKEND": "mongo"}):
            _reset_caches_for_tests()
            adapter = get_grid_adapter()

        self.assertIsInstance(adapter, MongoGridAdapter)

    def test_grid_backend_sql_returns_stub(self):
        with mock.patch.dict(os.environ, {"FIFTYONE_GRID_BACKEND": "sql"}):
            _reset_caches_for_tests()
            adapter = get_grid_adapter()

        self.assertIsInstance(adapter, SQLGridAdapter)
        self.assertIsInstance(adapter, GridDataAdapter)

    def test_grid_backend_unknown_raises(self):
        with mock.patch.dict(os.environ, {"FIFTYONE_GRID_BACKEND": "banana"}):
            _reset_caches_for_tests()
            with self.assertRaises(ValueError):
                get_grid_adapter()

    def test_grid_backend_case_insensitive_and_trimmed(self):
        with mock.patch.dict(
            os.environ, {"FIFTYONE_GRID_BACKEND": "  Mongo  "}
        ):
            _reset_caches_for_tests()
            adapter = get_grid_adapter()

        self.assertIsInstance(adapter, MongoGridAdapter)

    def test_grid_adapter_is_singleton_per_process(self):
        _reset_caches_for_tests()
        first = get_grid_adapter()
        second = get_grid_adapter()
        self.assertIs(first, second)

    def test_metadata_adapter_always_mongo(self):
        with mock.patch.dict(os.environ, {"FIFTYONE_GRID_BACKEND": "sql"}):
            _reset_caches_for_tests()
            adapter = get_metadata_adapter()

        self.assertIsInstance(adapter, MongoMetadataAdapter)
        self.assertIsInstance(adapter, MetadataAdapter)

    def test_metadata_adapter_is_singleton_per_process(self):
        _reset_caches_for_tests()
        first = get_metadata_adapter()
        second = get_metadata_adapter()
        self.assertIs(first, second)


if __name__ == "__main__":
    unittest.main()
