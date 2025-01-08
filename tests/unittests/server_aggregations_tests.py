"""
FiftyOne Server aggregation count tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import strawberry as gql
from strawberry.schema.config import StrawberryConfig

import fiftyone as fo

from fiftyone.server.constants import SCALAR_OVERRIDES
from fiftyone.server.aggregate import AggregateQuery
from fiftyone.server.aggregations import aggregate_resolver

from decorators import drop_async_dataset
from utils.graphql import execute


@gql.type
class AggregationsQuery(AggregateQuery):
    aggregations = gql.field(resolver=aggregate_resolver)


schema = gql.Schema(
    query=AggregationsQuery,
    scalar_overrides=SCALAR_OVERRIDES,
    config=StrawberryConfig(auto_camel_case=False),
)


class TestGroupModeSidebarCounts(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_empty(self, dataset: fo.Dataset):
        query = """
            query Query($form: AggregationForm!) {
                aggregations(form: $form) {
                    ... on StringAggregation {
                        path
                    }
                }
            }
        """

        result = await execute(
            schema,
            query,
            {
                "form": {
                    "dataset": dataset.name,
                    "extended_stages": {},
                    "filters": {},
                    "group_id": None,
                    "hidden_labels": [],
                    "index": 0,
                    "mixed": False,
                    "paths": [],
                    "sample_ids": [],
                    "slice": None,
                    "slices": None,
                    "view": [],
                }
            },
        )

        self.assertEqual(
            result.data,
            {
                "aggregations": [],
            },
        )

    @drop_async_dataset
    async def test_group_mode_sidebar_counts(self, dataset: fo.Dataset):
        _add_samples(dataset)

        query = """
            query Query($form: AggregationForm!) {
                aggregations(form: $form) {
                    ... on StringAggregation {
                        path
                        count
                        exists
                        values {
                            count
                            value
                        }
                    }
                }
            }
        """

        result = await execute(
            schema,
            query,
            {
                "form": {
                    "index": 0,
                    "dataset": dataset.name,
                    "extended_stages": {},
                    "filters": {
                        "label.label": {
                            "values": [
                                "default",
                            ],
                            "exclude": False,
                            "isMatching": False,
                        }
                    },
                    "group_id": None,
                    "hidden_labels": [],
                    "paths": ["label.label"],
                    "mixed": True,
                    "sample_ids": [],
                    "slice": "default",
                    "slices": None,
                    "view": [],
                }
            },
        )

        # ensure only "default" count is returned, "other" should be omitted
        self.assertEqual(
            result.data,
            {
                "aggregations": [
                    {
                        "path": "label.label",
                        "count": 1,
                        "exists": 1,
                        "values": [{"count": 1, "value": "default"}],
                    },
                ],
            },
        )


class TestGroupModeHistogramCounts(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_group_mode_histogram_counts(self, dataset: fo.Dataset):
        _add_samples(dataset)

        query = """
            query Query(
                $dataset: String!
                $view: BSONArray!
                $path: String!
                $form: ExtendedViewForm
            ) {
                aggregate(
                dataset_name: $dataset
                view: $view
                aggregations: [{ count_values: { field: $path } }]
                form: $form
                ) {
                ... on StrCountValuesResponse {
                        values {
                            value
                            key
                        }
                    }
                }
            }
        """

        result = await execute(
            schema,
            query,
            {
                "dataset": dataset.name,
                "view": [],
                "path": "label.label",
                "form": {
                    "filters": {
                        "label.label": {
                            "values": [
                                "default",
                            ],
                            "exclude": False,
                            "isMatching": False,
                        }
                    },
                    "mixed": True,
                    "slice": "default",
                },
            },
        )

        # ensure only "default" count is returned, "other" should be omitted
        self.assertEqual(
            result.data,
            {"aggregate": [{"values": [{"value": 1, "key": "default"}]}]},
        )


def _add_samples(dataset: fo.Dataset):
    group = fo.Group()
    dataset.add_group_field("group", default="default")
    dataset.add_samples(
        [
            fo.Sample(
                filepath="default.png",
                group=group.element("default"),
                label=fo.Classification(label="default"),
            ),
            fo.Sample(
                filepath="other.png",
                group=group.element("other"),
                label=fo.Classification(label="other"),
            ),
        ]
    )
