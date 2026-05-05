"""
Tests for fiftyone.server.db.mongo.MongoMetadataAdapter.

Exercises the always-Mongo metadata adapter against a temporary collection
seeded with synthetic documents. Verifies that ``find_documents`` and
``aggregate_collection`` produce identical output to a direct Motor call.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=import-error,no-name-in-module

import unittest
import uuid

import fiftyone.core.odm as foo

from fiftyone.server.db.mongo import MongoMetadataAdapter


class TestMongoMetadataAdapter(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.collection_name = f"test_metadata_adapter_{uuid.uuid4().hex[:8]}"
        db = foo.get_db_conn()
        db.drop_collection(cls.collection_name)
        db[cls.collection_name].insert_many(
            [
                {"name": "alpha", "value": 1, "tags": ["a", "b"]},
                {"name": "beta", "value": 2, "tags": ["b"]},
                {"name": "gamma", "value": 3, "tags": ["a", "c"]},
            ]
        )

    @classmethod
    def tearDownClass(cls):
        foo.get_db_conn().drop_collection(cls.collection_name)

    async def test_find_documents_returns_matching_docs(self):
        adapter = MongoMetadataAdapter()
        docs = await adapter.find_documents(
            self.collection_name, {"name": {"$in": ["alpha", "gamma"]}}
        )
        names = sorted(d["name"] for d in docs)
        self.assertEqual(names, ["alpha", "gamma"])

    async def test_find_documents_honors_projection(self):
        adapter = MongoMetadataAdapter()
        docs = await adapter.find_documents(
            self.collection_name,
            {"name": "alpha"},
            {"name": 1, "_id": 0},
        )
        self.assertEqual(docs, [{"name": "alpha"}])

    async def test_aggregate_collection_runs_pooled_pipelines(self):
        adapter = MongoMetadataAdapter()
        results = await adapter.aggregate_collection(
            self.collection_name,
            [
                [{"$match": {"value": {"$gte": 2}}}, {"$sort": {"value": 1}}],
                [{"$count": "total"}],
            ],
        )
        first_pipeline, second_pipeline = results
        self.assertEqual(
            [d["name"] for d in first_pipeline], ["beta", "gamma"]
        )
        self.assertEqual(second_pipeline, [{"total": 3}])


if __name__ == "__main__":
    unittest.main()
