"""
FiftyOne server lightning tests

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import asdict
from datetime import date, datetime
import typing as t
import unittest

import strawberry as gql
from strawberry.schema.config import StrawberryConfig

import fiftyone as fo

from fiftyone.server.constants import SCALAR_OVERRIDES
from fiftyone.server.lightning import (
    lightning_resolver,
    LightningInput,
    LightningPathInput,
)

from decorators import drop_datasets


@gql.type
class LightningQuery:
    lightning = gql.field(resolver=lightning_resolver)


schema = gql.Schema(
    query=LightningQuery,
    scalar_overrides=SCALAR_OVERRIDES,
    config=StrawberryConfig(auto_camel_case=False),
)


LOWER_BOUND_DATA = dict(
    bool=False,
    bool_list=[False],
    float=-1,
    float_list=[-1],
    date=date(2000, 1, 1),
    date_list=[date(2000, 1, 1)],
    datetime=datetime(2000, 1, 1),
    datetime_list=[datetime(2000, 1, 1)],
    str="one",
    str_list=["one"],
)

UPPER_BOUND_DATA = dict(
    bool=True,
    bool_list=[True],
    date=date(2010, 1, 1),
    date_list=[date(2010, 1, 1)],
    datetime=datetime(2010, 1, 1, 3, 3, 3, 3),
    datetime_list=[datetime(2010, 1, 1, 3, 3, 3, 3)],
    str="two",
    str_list=["two"],
)


class TestLightningFloat(unittest.IsolatedAsyncioTestCase):
    @drop_datasets
    async def test_floats(self):
        lower = dict(
            float=-1.0,
            float_list=[-1.0],
            inf=float("-inf"),
            inf_list=float("-inf"),
            nan=float("nan"),
            nan_list=[float("nan")],
        )
        upper = dict(
            float=1.0,
            float_list=[1.0],
            inf=float("inf"),
            inf_list=float("inf"),
        )
        dataset: fo.Dataset = fo.Dataset()
        one = fo.Sample(
            filepath="one.mp4",
            classification=fo.Classification(**lower),
            detections=fo.Detections(detections=[fo.Detection(**lower)]),
            **lower,
        )
        two = fo.Sample(
            filepath="two.mp4",
            classification=fo.Classification(**upper),
            detections=fo.Detections(detections=[fo.Detection(**upper)]),
            **upper,
        )
        dataset.add_samples([one, two])
        dataset.add_dynamic_sample_fields()

        query = """
            query ImageDatasetQuery($input: LightningInput!) {
                lightning(input: $input) {
                    ... on FloatLightningAggregation {
                        inf
                        max
                        min
                        path
                        nan
                        ninf
                    }
                }
            }
        """

        result = await schema.execute(
            query,
            variable_values={
                "input": asdict(
                    LightningInput(
                        dataset=dataset.name,
                        paths=_get_paths(dataset, fo.FloatField),
                    )
                )
            },
        )
        fo.pprint(result)
        self.assertDictEqual(
            result.data,
            {
                "lightning": [
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "classification.confidence",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": 1.0,
                        "min": -1.0,
                        "path": "classification.float",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": 1.0,
                        "min": -1.0,
                        "path": "classification.float_list",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": True,
                        "max": None,
                        "min": None,
                        "path": "classification.inf",
                        "nan": False,
                        "ninf": True,
                    },
                    {
                        "inf": True,
                        "max": None,
                        "min": None,
                        "path": "classification.inf_list",
                        "nan": False,
                        "ninf": True,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "classification.nan",
                        "nan": True,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "classification.nan_list",
                        "nan": True,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.bounding_box",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.confidence",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": 1.0,
                        "min": -1.0,
                        "path": "detections.detections.float",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": 1.0,
                        "min": -1.0,
                        "path": "detections.detections.float_list",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": True,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.inf",
                        "nan": False,
                        "ninf": True,
                    },
                    {
                        "inf": True,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.inf_list",
                        "nan": False,
                        "ninf": True,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.nan",
                        "nan": True,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.nan_list",
                        "nan": True,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": 1.0,
                        "min": -1.0,
                        "path": "float",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": 1.0,
                        "min": -1.0,
                        "path": "float_list",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": True,
                        "max": None,
                        "min": None,
                        "path": "inf",
                        "nan": False,
                        "ninf": True,
                    },
                    {
                        "inf": True,
                        "max": None,
                        "min": None,
                        "path": "inf_list",
                        "nan": False,
                        "ninf": True,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "nan",
                        "nan": True,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "nan_list",
                        "nan": True,
                        "ninf": False,
                    },
                ]
            },
        )


def _get_paths(dataset: fo.Dataset, field_type):
    paths: t.List[LightningPathInput] = []
    field_dict = dataset.get_field_schema(flat=True)
    for path in sorted(field_dict):
        field = field_dict[path]
        if isinstance(field, fo.ListField):
            field = field.field

        if not isinstance(field, field_type):
            continue

        paths.append(LightningPathInput(path=path))

    return paths
