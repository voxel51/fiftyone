"""
Tests for fiftyone.server.db.mongo.MongoGridAdapter.

Each test runs the adapter method and compares its output to a direct
call against the existing FiftyOne core machinery, proving the adapter is
a pure relocation of behavior with no functional drift.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.core.odm as foo

from fiftyone.server.db.mongo import MongoGridAdapter
from fiftyone.server.samples import get_samples_pipeline

from decorators import drop_async_dataset  # pylint: disable=import-error


def _add_samples(dataset: fo.Dataset):
    dataset.add_samples(
        [
            fo.Sample(
                filepath=f"/tmp/img_{i}.jpg",
                weather="sunny" if i % 2 == 0 else "cloudy",
                score=float(i),
            )
            for i in range(5)
        ]
    )


class TestMongoGridAdapter(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_estimated_sample_count(self, dataset: fo.Dataset):
        _add_samples(dataset)

        adapter = MongoGridAdapter()
        count = await adapter.estimated_sample_count(
            dataset._sample_collection_name
        )
        direct = await foo.get_async_db_conn()[
            dataset._sample_collection_name
        ].estimated_document_count()
        self.assertEqual(count, direct)

    @drop_async_dataset
    async def test_paginate_samples_matches_direct_pipeline(
        self, dataset: fo.Dataset
    ):
        _add_samples(dataset)
        view = dataset.view()

        adapter = MongoGridAdapter()
        samples, more = await adapter.paginate_samples(
            view, sample_filter=None, first=2
        )

        # direct equivalent
        pipeline = await get_samples_pipeline(view, None)
        direct = await foo.aggregate(
            foo.get_async_db_conn()[view._dataset._sample_collection_name],
            pipeline,
            None,
            maxTimeMS=None,
        ).to_list(3)

        # Adapter trims to `first`; direct returns first+1 to detect more.
        self.assertEqual(samples, direct[:2])
        self.assertTrue(more)

    @drop_async_dataset
    async def test_paginate_samples_no_more_when_under_limit(
        self, dataset: fo.Dataset
    ):
        _add_samples(dataset)
        view = dataset.view()

        adapter = MongoGridAdapter()
        samples, more = await adapter.paginate_samples(
            view, sample_filter=None, first=100
        )

        self.assertEqual(len(samples), 5)
        self.assertFalse(more)

    @drop_async_dataset
    async def test_get_grid_field_schema_matches_serialize_fields(
        self, dataset: fo.Dataset
    ):
        from fiftyone.core.state import serialize_fields

        _add_samples(dataset)
        view = dataset.view()

        adapter = MongoGridAdapter()
        from_adapter = await adapter.get_grid_field_schema(view)
        direct = serialize_fields(view.get_field_schema(flat=True))
        self.assertEqual(from_adapter, direct)

    @drop_async_dataset
    async def test_count_field_values_matches_direct(
        self, dataset: fo.Dataset
    ):
        _add_samples(dataset)
        view = dataset.view()

        adapter = MongoGridAdapter()
        count, page = await adapter.count_field_values(
            view,
            path="weather",
            first=10,
            asc=True,
            sort_by="_id",
            search=None,
            selected=None,
        )
        direct_count, direct_page = await view._async_aggregate(
            foa.CountValues(
                "weather",
                _first=10,
                _asc=True,
                _sort_by="_id",
                _search=None,
                _selected=None,
            ),
        )
        self.assertEqual(count, direct_count)
        self.assertEqual(list(page), list(direct_page))


if __name__ == "__main__":
    unittest.main()
