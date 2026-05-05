"""
Tests for the SQL grid adapter stub.

The stub exists to validate that GridDataAdapter is implementable from a
non-Mongo perspective. Every method must conform to the Protocol and must
raise NotImplementedError when invoked. The "iterate the Protocol's
methods" assertion ensures that adding a new GridDataAdapter method
automatically requires a corresponding stub.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import inspect
import unittest

from fiftyone.server.db import GridDataAdapter
from fiftyone.server.db.sql import SQLGridAdapter


def _grid_adapter_methods() -> list:
    return [
        name
        for name in dir(GridDataAdapter)
        if not name.startswith("_")
        and inspect.iscoroutinefunction(getattr(GridDataAdapter, name))
    ]


class TestSQLStub(unittest.IsolatedAsyncioTestCase):
    def test_conforms_to_grid_data_adapter_protocol(self):
        self.assertIsInstance(SQLGridAdapter(), GridDataAdapter)

    def test_stub_implements_every_protocol_method(self):
        protocol_methods = set(_grid_adapter_methods())
        stub_methods = {
            name
            for name in dir(SQLGridAdapter)
            if not name.startswith("_")
            and inspect.iscoroutinefunction(getattr(SQLGridAdapter, name))
        }
        missing = protocol_methods - stub_methods
        self.assertFalse(
            missing,
            f"SQLGridAdapter is missing stub methods: {missing}",
        )

    async def test_paginate_samples_raises(self):
        with self.assertRaises(NotImplementedError):
            await SQLGridAdapter().paginate_samples(
                view=None,
                sample_filter=None,
                first=10,
            )

    async def test_aggregate_paths_raises(self):
        with self.assertRaises(NotImplementedError):
            await SQLGridAdapter().aggregate_paths(view=None, form=None)

    async def test_count_field_values_raises(self):
        with self.assertRaises(NotImplementedError):
            await SQLGridAdapter().count_field_values(
                view=None,
                path="x",
                first=10,
                asc=True,
                sort_by="count",
                search=None,
                selected=None,
            )

    async def test_lightning_raises(self):
        with self.assertRaises(NotImplementedError):
            await SQLGridAdapter().lightning(dataset=None, input=None)

    async def test_estimated_sample_count_raises(self):
        with self.assertRaises(NotImplementedError):
            await SQLGridAdapter().estimated_sample_count("samples")

    async def test_get_grid_field_schema_raises(self):
        with self.assertRaises(NotImplementedError):
            await SQLGridAdapter().get_grid_field_schema(view=None)


if __name__ == "__main__":
    unittest.main()
