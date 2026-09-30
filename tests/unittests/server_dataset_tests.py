"""
FiftyOne server dataset tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

import unittest
import numpy as np
import strawberry as gql
from strawberry.schema.config import StrawberryConfig

import fiftyone as fo
import fiftyone.brain as fob
import fiftyone.core.media as fom

from fiftyone.server.scalars import BSONArray, SCALAR_MAP
from fiftyone.server.query import Dataset

from decorators import drop_async_dataset
from utils.graphql import execute


@gql.type
class DatasetQuery:
    dataset: Dataset = gql.field(resolver=Dataset.resolver)


schema = gql.Schema(
    query=DatasetQuery,
    config=StrawberryConfig(auto_camel_case=False, scalar_map=SCALAR_MAP),
)

MEDIA_TYPES = {media_type: media_type for media_type in fom.MEDIA_TYPES}


class TestDataset(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_group_media_types(self, dataset: fo.Dataset):
        dataset.media_type = "group"
        for media_type in MEDIA_TYPES:
            dataset.add_group_slice(media_type, media_type)

        query = """
            query Query($name: String!, $view: BSONArray) {
                dataset(name: $name, view: $view) {
                    group_media_types {
                        media_type
                        name
                    }
                }
            }
        """

        response = lambda media_type: {
            "group_media_types": [
                {"media_type": MEDIA_TYPES[media_type], "name": media_type}
            ]
        }
        asserter = lambda result, media_type: self.assertEqual(
            result.data["dataset"], response(media_type)
        )

        for media_type in fom.MEDIA_TYPES:
            view = dataset.select_group_slices(slices=media_type, flat=False)
            result = await _execute(
                query, dataset.name, view=view._serialize()
            )
            asserter(result, media_type)

            view = dataset.select_group_slices(
                media_type=media_type, flat=False
            )
            result = await _execute(
                query, dataset.name, view=view._serialize()
            )
            asserter(result, media_type)

    @drop_async_dataset
    async def test_brain_run_results_meta(self, dataset: fo.Dataset):
        dataset.add_group_field("group", default="left")
        group = fo.Group()
        dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/l.jpg", group=group.element("left")),
                fo.Sample(filepath="/tmp/r.jpg", group=group.element("right")),
            ]
        )
        fob.compute_similarity(
            dataset.select_group_slices("right"),
            embeddings=np.zeros((1, 4)),
            brain_key="sim",
            backend="sklearn",
        )

        query = """
            query Query($name: String!) {
                dataset(name: $name) {
                    brain_methods {
                        results_meta {
                            group_slices
                        }
                    }
                }
            }
        """
        result = await _execute(query, dataset.name)
        self.assertEqual(
            result.data["dataset"]["brain_methods"],
            [{"results_meta": {"group_slices": ["right"]}}],
        )

    @drop_async_dataset
    async def test_brain_run_results_meta_without_the_key_is_null(
        self, dataset: fo.Dataset
    ):
        dataset.add_samples([fo.Sample(filepath="/tmp/a.jpg")])
        for brain_key, meta in (("unrecorded", {}), ("malformed", None)):
            fob.compute_similarity(
                dataset,
                embeddings=np.zeros((1, 4)),
                brain_key=brain_key,
                backend="sklearn",
            )
            run_doc = dataset._doc.brain_methods[brain_key]
            run_doc.results_meta = (
                {"group_slices": "left"} if meta is None else meta
            )
            run_doc.save()

        query = """
            query Query($name: String!) {
                dataset(name: $name) {
                    brain_methods {
                        results_meta {
                            group_slices
                        }
                    }
                }
            }
        """
        result = await _execute(query, dataset.name)
        self.assertIsNone(result.errors)
        self.assertEqual(
            result.data["dataset"]["brain_methods"],
            [
                {"results_meta": {"group_slices": None}},
                {"results_meta": {"group_slices": None}},
            ],
        )


async def _execute(query: str, name: str, view: t.Optional[BSONArray] = None):
    return await execute(schema, query, variables={"name": name, "view": view})
