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


@gql.type
class LightningQuery:
    lightning = gql.field(resolver=lightning_resolver)


schema = gql.Schema(
    query=LightningQuery,
    scalar_overrides=SCALAR_OVERRIDES,
    config=StrawberryConfig(auto_camel_case=False),
)


class TestBooleanLightningQueries(unittest.IsolatedAsyncioTestCase):
    async def test_booleans(self):
        lower = dict(
            bool=False,
            bool_list=[False],
            none=False,
        )
        upper = dict(
            bool=True,
            float_list=[True],
            none=None,
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
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on BooleanLightningResult {
                        false
                        path
                        true
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
                        paths=_get_paths(dataset, fo.BooleanField),
                    )
                )
            },
        )

        self.assertDictEqual(
            result.data,
            {
                "lightning": [
                    {"false": True, "path": "bool", "true": True},
                    {"false": True, "path": "bool_list", "true": False},
                    {
                        "false": True,
                        "path": "classification.bool",
                        "true": True,
                    },
                    {
                        "false": True,
                        "path": "classification.bool_list",
                        "true": False,
                    },
                    {
                        "false": False,
                        "path": "classification.float_list",
                        "true": True,
                    },
                    {
                        "false": True,
                        "path": "classification.none",
                        "true": False,
                    },
                    {
                        "false": True,
                        "path": "detections.detections.bool",
                        "true": True,
                    },
                    {
                        "false": True,
                        "path": "detections.detections.bool_list",
                        "true": False,
                    },
                    {
                        "false": False,
                        "path": "detections.detections.float_list",
                        "true": True,
                    },
                    {
                        "false": True,
                        "path": "detections.detections.none",
                        "true": False,
                    },
                    {"false": False, "path": "float_list", "true": True},
                    {"false": True, "path": "none", "true": False},
                ]
            },
        )


class TestDateLightningQueries(unittest.IsolatedAsyncioTestCase):
    async def test_dates(self):
        lower = dict(
            date=date(2000, 1, 1),
            date_list=[date(2000, 1, 1)],
        )
        upper = dict(
            date=date(2001, 1, 1),
            date_list=[date(2001, 1, 1)],
        )
        dataset: fo.Dataset = fo.Dataset()
        one = fo.Sample(
            filepath="one.mp4",
            **lower,
        )
        two = fo.Sample(
            filepath="two.mp4",
            **upper,
        )
        dataset.add_samples([one, two])
        dataset.add_dynamic_sample_fields()

        query = """
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on DateLightningResult {
                        max
                        min
                        path
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
                        paths=_get_paths(dataset, fo.DateField),
                    )
                )
            },
        )
        self.assertDictEqual(
            result.data,
            {
                "lightning": [
                    {
                        "max": 978307200000.0,
                        "min": 946684800000.0,
                        "path": "date",
                    },
                    {
                        "max": 978307200000.0,
                        "min": 946684800000.0,
                        "path": "date_list",
                    },
                ]
            },
        )


class TestDatetimeLightningQueries(unittest.IsolatedAsyncioTestCase):
    async def test_datetimes(self):
        lower = dict(
            datetime=datetime(2000, 1, 1, 1, 59, 59, 59),
            datetime_list=[datetime(2000, 1, 1, 1, 59, 59, 59)],
        )
        upper = dict(
            datetime=datetime(2001, 1, 1, 23, 59, 59, 59),
            datetime_list=[datetime(2001, 1, 1, 23, 59, 59, 59)],
        )
        dataset: fo.Dataset = fo.Dataset()
        one = fo.Sample(
            filepath="one.mp4",
            classification=fo.Classification(**upper),
            detections=fo.Detections(detections=[fo.Detection(**upper)]),
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
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on DateTimeLightningResult {
                        max
                        min
                        path
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
                        paths=_get_paths(dataset, fo.DateTimeField),
                    )
                )
            },
        )

        self.assertDictEqual(
            result.data,
            {
                "lightning": [
                    {
                        "max": 978393599000.0,
                        "min": 978393599000.0,
                        "path": "classification.datetime",
                    },
                    {
                        "max": 978393599000.0,
                        "min": 978393599000.0,
                        "path": "classification.datetime_list",
                    },
                    {
                        "max": 978393599000.0,
                        "min": 946691999000.0,
                        "path": "datetime",
                    },
                    {
                        "max": 978393599000.0,
                        "min": 946691999000.0,
                        "path": "datetime_list",
                    },
                    {
                        "max": 978393599000.0,
                        "min": 978393599000.0,
                        "path": "detections.detections.datetime",
                    },
                    {
                        "max": 978393599000.0,
                        "min": 978393599000.0,
                        "path": "detections.detections.datetime_list",
                    },
                ]
            },
        )


class TestFloatLightningQueries(unittest.IsolatedAsyncioTestCase):
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
            classification=fo.Classification(**upper),
            detections=fo.Detections(detections=[fo.Detection(**upper)]),
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
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on FloatLightningResult {
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
                        "max": None,
                        "min": None,
                        "path": "classification.float",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "classification.float_list",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "classification.inf",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "classification.inf_list",
                        "nan": False,
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
                        "max": None,
                        "min": None,
                        "path": "detections.detections.float",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.float_list",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.inf",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "detections.detections.inf_list",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "float",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "float_list",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "inf",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "inf_list",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "metadata.duration",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "metadata.frame_rate",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "nan",
                        "nan": False,
                        "ninf": False,
                    },
                    {
                        "inf": False,
                        "max": None,
                        "min": None,
                        "path": "nan_list",
                        "nan": False,
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
