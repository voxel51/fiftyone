"""
FiftyOne server dataset tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

import unittest
import strawberry as gql
from strawberry.schema.config import StrawberryConfig

import fiftyone as fo
import fiftyone.core.media as fom

from fiftyone.server.constants import SCALAR_OVERRIDES
from fiftyone.server.scalars import BSONArray
from fiftyone.server.query import Dataset

from decorators import drop_async_dataset
from utils.graphql import execute


@gql.type
class DatasetQuery:
    dataset: Dataset = gql.field(resolver=Dataset.resolver)


schema = gql.Schema(
    query=DatasetQuery,
    scalar_overrides=SCALAR_OVERRIDES,
    config=StrawberryConfig(auto_camel_case=False),
)

MEDIA_TYPES = {media_type: media_type for media_type in fom.MEDIA_TYPES}
MEDIA_TYPES[fom.POINT_CLOUD] = "point_cloud"
MEDIA_TYPES[fom.THREE_D] = "three_d"


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


async def _execute(query: str, name: str, view: t.Optional[BSONArray] = None):
    return await execute(schema, query, variables={"name": name, "view": view})
