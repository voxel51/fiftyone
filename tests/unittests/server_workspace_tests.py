"""
FiftyOne Server workspace tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import strawberry as gql
from strawberry.schema.config import StrawberryConfig

import fiftyone as fo

from fiftyone.server.constants import SCALAR_OVERRIDES
from fiftyone.server.query import Dataset

from decorators import drop_async_dataset
from utils.graphql import execute


@gql.type
class DatasetQuery(Dataset):
    dataset: Dataset = gql.field(resolver=Dataset.resolver)


schema = gql.Schema(
    query=DatasetQuery,
    scalar_overrides=SCALAR_OVERRIDES,
    config=StrawberryConfig(auto_camel_case=False),
)


class TestGroupModeSidebarCounts(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_workspace_field(self, dataset: fo.Dataset):
        histograms_panel = fo.Panel(type="Histograms")
        name = "histograms"
        workspace = fo.Space(children=[histograms_panel])
        dataset.save_workspace(name, workspace)

        query = """
            query Query($name: String!, $slug: String!) {
                dataset(name: $name) {
                    workspace(slug: $slug) {
                        child
                        name
                        slug
                    }
                }
            }
        """

        result = await execute(
            schema,
            query,
            {"name": dataset.name, "slug": name},
        )

        self.assertEqual(
            result.data,
            {
                "dataset": {
                    "workspace": {
                        "child": workspace.to_dict(),
                        "name": "histograms",
                        "slug": name,
                    }
                }
            },
        )
