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
from fiftyone.server.context import get_context
from fiftyone.server.lightning import (
    lightning_resolver,
    LightningInput,
    LightningPathInput,
)

from decorators import drop_async_dataset


@gql.type
class LightningQuery:
    lightning = gql.field(resolver=lightning_resolver)


schema = gql.Schema(
    query=LightningQuery,
    scalar_overrides=SCALAR_OVERRIDES,
    config=StrawberryConfig(auto_camel_case=False),
)


class TestBooleanLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_booleans(self, dataset: fo.Dataset):
        lower = dict(
            bool=False,
            bool_list=[False],
            none=False,
        )
        upper = dict(
            bool=True,
            bool_list=[True],
            none=None,
        )
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

        result = await _execute(query, dataset, fo.BooleanField, lower.keys())

        self.assertListEqual(
            result.data["lightning"],
            [
                {"false": True, "path": "bool", "true": True},
                {"false": True, "path": "bool_list", "true": True},
                {
                    "false": True,
                    "path": "classification.bool",
                    "true": True,
                },
                {
                    "false": True,
                    "path": "classification.bool_list",
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
                    "true": True,
                },
                {
                    "false": True,
                    "path": "detections.detections.none",
                    "true": False,
                },
                {"false": True, "path": "none", "true": False},
            ],
        )


class TestDateLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_dates(self, dataset: fo.Dataset):
        lower = dict(
            date=date(2000, 1, 1),
            date_list=[date(2000, 1, 1)],
        )
        upper = dict(
            date=date(2001, 1, 1),
            date_list=[date(2001, 1, 1)],
        )
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

        result = await _execute(query, dataset, fo.DateField, lower.keys())

        self.assertListEqual(
            result.data["lightning"],
            [
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
            ],
        )


class TestDatetimeLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_datetimes(self, dataset: fo.Dataset):
        lower = dict(
            datetime=datetime(2000, 1, 1, 1, 59, 59, 59),
            datetime_list=[datetime(2000, 1, 1, 1, 59, 59, 59)],
        )
        upper = dict(
            datetime=datetime(2001, 1, 1, 23, 59, 59, 59),
            datetime_list=[datetime(2001, 1, 1, 23, 59, 59, 59)],
        )
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
                    ... on DateTimeLightningResult {
                        max
                        min
                        path
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.DateTimeField, lower.keys())

        self.assertListEqual(
            result.data["lightning"],
            [
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "path": "classification.datetime",
                },
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
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
                    "min": 946691999000.0,
                    "path": "detections.detections.datetime",
                },
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "path": "detections.detections.datetime_list",
                },
            ],
        )


class TestFloatLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_floats(self, dataset: fo.Dataset):
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

        result = await _execute(query, dataset, fo.FloatField, lower.keys())

        self.assertListEqual(
            result.data["lightning"],
            [
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
            ],
        )


class TestStringLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_strings(self, dataset: fo.Dataset):
        lower = dict(
            str="lower",
            str_list=["lower"],
            none="none",
        )
        upper = dict(
            str="upper",
            str_list=["upper"],
            none=None,
        )
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
                    ... on StringLightningResult {
                        path
                        values
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.StringField, lower.keys())

        self.assertListEqual(
            result.data["lightning"],
            [
                {"path": "classification.none", "values": [None, "none"]},
                {"path": "classification.str", "values": ["lower", "upper"]},
                {
                    "path": "classification.str_list",
                    "values": ["lower", "upper"],
                },
                {
                    "path": "detections.detections.none",
                    "values": [None, "none"],
                },
                {
                    "path": "detections.detections.str",
                    "values": ["lower", "upper"],
                },
                {
                    "path": "detections.detections.str_list",
                    "values": ["lower", "upper"],
                },
                {"path": "metadata.encoding_str", "values": []},
                {"path": "none", "values": ["none"]},
                {"path": "str", "values": ["lower", "upper"]},
                {"path": "str_list", "values": ["lower", "upper"]},
            ],
        )


def _get_paths(
    dataset: fo.Dataset, field_type: t.Type[fo.Field], keys: t.Set[str]
):
    paths: t.List[LightningPathInput] = []
    field_dict = dataset.get_field_schema(flat=True)
    for path in sorted(field_dict):
        field = field_dict[path]
        if isinstance(field, fo.ListField):
            field = field.field

        if not isinstance(field, field_type):
            continue

        if all([key not in path for key in keys]):
            continue

        paths.append(LightningPathInput(path=path))

    return paths


async def _execute(
    query: str, dataset: fo.Dataset, field: fo.Field, keys: t.Iterable[str]
):
    keys = set(keys)
    return await schema.execute(
        query,
        variable_values={
            "input": asdict(
                LightningInput(
                    dataset=dataset.name,
                    paths=_get_paths(dataset, field, keys),
                )
            )
        },
        context_value=get_context(use_global_db_client=False),
    )
