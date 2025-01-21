"""
FiftyOne Server lightning tests.

| Copyright 2017-2025, Voxel51, Inc.
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

from decorators import drop_async_dataset
from utils.graphql import execute


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
        keys = _add_samples(
            dataset,
            dict(
                bool=False,
                bool_list=[False],
                none=False,
            ),
            dict(
                bool=True,
                bool_list=[True],
                none=None,
            ),
        )

        query = """
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on BooleanLightningResult {
                        path
                        false
                        none
                        true
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.BooleanField, keys)
        self.assertListEqual(
            result.data["lightning"],
            [
                {"path": "bool", "false": True, "none": False, "true": True},
                {
                    "path": "bool_list",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "classification.bool",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "classification.bool_list",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "classification.none",
                    "false": True,
                    "none": True,
                    "true": False,
                },
                {
                    "path": "detections.detections.bool",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "detections.detections.bool_list",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "detections.detections.none",
                    "false": True,
                    "none": True,
                    "true": False,
                },
                {
                    "path": "frames.bool",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "frames.bool_list",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "frames.classification.bool",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "frames.classification.bool_list",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "frames.classification.none",
                    "false": True,
                    "none": True,
                    "true": False,
                },
                {
                    "path": "frames.detections.detections.bool",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "frames.detections.detections.bool_list",
                    "false": True,
                    "none": False,
                    "true": True,
                },
                {
                    "path": "frames.detections.detections.none",
                    "false": True,
                    "none": True,
                    "true": False,
                },
                {
                    "path": "frames.none",
                    "false": True,
                    "none": True,
                    "true": False,
                },
                {"path": "none", "false": True, "none": True, "true": False},
            ],
        )


class TestDateLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_dates(self, dataset: fo.Dataset):
        # adding dynamic (embedded) fields always yields fo.DateTime fields,
        # so only top level fields are tested
        keys = _add_samples(
            dataset,
            dict(
                date=date(2000, 1, 1),
                date_list=[date(2000, 1, 1)],
            ),
            dict(
                date=date(2001, 1, 1),
                date_list=[date(2001, 1, 1)],
            ),
        )

        query = """
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on DateLightningResult {
                        path
                        max
                        min
                        none
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.DateField, keys)
        self.assertListEqual(
            result.data["lightning"],
            [
                {
                    "path": "date",
                    "max": 978307200000.0,
                    "min": 946684800000.0,
                    "none": False,
                },
                {
                    "path": "date_list",
                    "max": 978307200000.0,
                    "min": 946684800000.0,
                    "none": False,
                },
                {
                    "path": "frames.date",
                    "max": 978307200000.0,
                    "min": 946684800000.0,
                    "none": False,
                },
                {
                    "path": "frames.date_list",
                    "max": 978307200000.0,
                    "min": 946684800000.0,
                    "none": False,
                },
            ],
        )


class TestDatetimeLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_datetimes(self, dataset: fo.Dataset):
        keys = _add_samples(
            dataset,
            dict(
                datetime=datetime(2000, 1, 1, 1, 59, 59, 59),
                datetime_list=[datetime(2000, 1, 1, 1, 59, 59, 59)],
            ),
            dict(
                datetime=datetime(2001, 1, 1, 23, 59, 59, 59),
                datetime_list=[datetime(2001, 1, 1, 23, 59, 59, 59)],
            ),
        )

        query = """
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on DateTimeLightningResult {
                        path
                        max
                        min
                        none
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.DateTimeField, keys)
        self.assertListEqual(
            result.data["lightning"],
            [
                {
                    "path": "classification.datetime",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "classification.datetime_list",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "datetime",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "datetime_list",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "detections.detections.datetime",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "detections.detections.datetime_list",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "frames.classification.datetime",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "frames.classification.datetime_list",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "frames.datetime",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "frames.datetime_list",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.datetime",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.datetime_list",
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "none": False,
                },
            ],
        )


class TestIntLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_ints(self, dataset: fo.Dataset):
        dataset.add_sample_field("frame_numbers", fo.FrameNumberField)
        dataset.add_sample_field("frame_supports", fo.FrameSupportField)
        dataset.add_sample_field("ints", fo.IntField)
        keys = _add_samples(
            dataset,
            dict(ints=1, frame_numbers=1, frame_supports=[1, 1]),
            dict(ints=2, frame_numbers=2, frame_supports=[2, 2]),
        )

        query = """
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on IntLightningResult {
                        path
                        max
                        min
                        none
                    }
                }
            }
        """

        result = await _execute(
            query,
            dataset,
            (fo.FrameNumberField, fo.FrameSupportField, fo.IntField),
            keys,
        )
        self.assertListEqual(
            result.data["lightning"],
            [
                {
                    "path": "classification.frame_numbers",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "classification.frame_supports",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "classification.ints",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "detections.detections.frame_numbers",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "detections.detections.frame_supports",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "detections.detections.ints",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frame_numbers",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frame_supports",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frames.classification.frame_numbers",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frames.classification.frame_supports",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frames.classification.ints",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.frame_numbers",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.frame_supports",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.ints",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frames.frame_numbers",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {
                    "path": "frames.frame_supports",
                    "max": 2.0,
                    "min": 1.0,
                    "none": False,
                },
                {"path": "frames.ints", "max": 2.0, "min": 1.0, "none": False},
                {"path": "ints", "max": 2.0, "min": 1.0, "none": False},
            ],
        )


class TestFloatLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_floats(self, dataset: fo.Dataset):
        keys = _add_samples(
            dataset,
            dict(
                float=-1.0,
                float_list=[0.0, -1.0],
                inf=-1.0,
                inf_list=[0.0, -1.0],
                nan=-1.0,
                nan_list=[0.0, -1.0],
                ninf=-1.0,
                ninf_list=[0.0, -1.0],
            ),
            dict(
                float=0.0,
                float_list=[0.0],
                inf=float("inf"),
                inf_list=[float("inf")],
                nan=float("nan"),
                nan_list=[float("nan")],
                ninf=float("-inf"),
                ninf_list=[float("-inf")],
            ),
            dict(
                float=1.0,
                float_list=[0.0, 1.0],
                inf=1.0,
                inf_list=[1.0],
                nan=1.0,
                nan_list=[0.0, 1.0],
                ninf=1.0,
                ninf_list=[0.0, 1.0],
            ),
        )

        query = """
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on FloatLightningResult {
                        path
                        inf
                        max
                        min
                        nan
                        ninf
                        none
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.FloatField, keys)

        self.assertListEqual(
            result.data["lightning"],
            [
                {
                    "path": "classification.float",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "classification.float_list",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "classification.inf",
                    "inf": True,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "classification.inf_list",
                    "inf": True,
                    "max": None,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "classification.nan",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "classification.nan_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "classification.ninf",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "classification.ninf_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "detections.detections.float",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "detections.detections.float_list",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "detections.detections.inf",
                    "inf": True,
                    "max": None,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "detections.detections.inf_list",
                    "inf": True,
                    "max": None,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "detections.detections.nan",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "detections.detections.nan_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "detections.detections.ninf",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "detections.detections.ninf_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "float",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "float_list",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.classification.float",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.classification.float_list",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.classification.inf",
                    "inf": True,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.classification.inf_list",
                    "inf": True,
                    "max": None,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.classification.nan",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.classification.nan_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.classification.ninf",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "frames.classification.ninf_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.float",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.float_list",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.inf",
                    "inf": True,
                    "max": None,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.inf_list",
                    "inf": True,
                    "max": None,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.nan",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.nan_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.ninf",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "frames.detections.detections.ninf_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "frames.float",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.float_list",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.inf",
                    "inf": True,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.inf_list",
                    "inf": True,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.nan",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.nan_list",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "frames.ninf",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "frames.ninf_list",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "inf",
                    "inf": True,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "inf_list",
                    "inf": True,
                    "max": None,
                    "min": -1.0,
                    "nan": False,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "nan",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "nan_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": True,
                    "ninf": False,
                    "none": False,
                },
                {
                    "path": "ninf",
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
                {
                    "path": "ninf_list",
                    "inf": False,
                    "max": 1.0,
                    "min": None,
                    "nan": False,
                    "ninf": True,
                    "none": False,
                },
            ],
        )


class TestStringLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_strings(self, dataset: fo.Dataset):
        keys = _add_samples(
            dataset,
            dict(
                str="lower",
                str_list=["lower"],
                none="none",
            ),
            dict(
                str="upper",
                str_list=["upper"],
                none=None,
            ),
        )

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

        result = await _execute(query, dataset, fo.StringField, keys)
        self.assertListEqual(
            result.data["lightning"],
            [
                {"path": "classification.none", "values": ["none"]},
                {"path": "classification.str", "values": ["lower", "upper"]},
                {
                    "path": "classification.str_list",
                    "values": ["lower", "upper"],
                },
                {"path": "detections.detections.none", "values": ["none"]},
                {
                    "path": "detections.detections.str",
                    "values": ["lower", "upper"],
                },
                {
                    "path": "detections.detections.str_list",
                    "values": ["lower", "upper"],
                },
                {"path": "frames.classification.none", "values": ["none"]},
                {
                    "path": "frames.classification.str",
                    "values": ["lower", "upper"],
                },
                {
                    "path": "frames.classification.str_list",
                    "values": ["lower", "upper"],
                },
                {
                    "path": "frames.detections.detections.none",
                    "values": ["none"],
                },
                {
                    "path": "frames.detections.detections.str",
                    "values": ["lower", "upper"],
                },
                {
                    "path": "frames.detections.detections.str_list",
                    "values": ["lower", "upper"],
                },
                {"path": "frames.none", "values": ["none"]},
                {"path": "frames.str", "values": ["lower", "upper"]},
                {"path": "frames.str_list", "values": ["lower", "upper"]},
                {"path": "metadata.encoding_str", "values": []},
                {"path": "none", "values": ["none"]},
                {"path": "str", "values": ["lower", "upper"]},
                {"path": "str_list", "values": ["lower", "upper"]},
            ],
        )


class TestGroupDatasetLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_group_dataset(self, dataset: fo.Dataset):
        group = fo.Group()
        one = fo.Sample(
            classifications=fo.Classifications(
                classifications=[
                    fo.Classification(label="one"),
                    fo.Classification(confidence=1),
                    fo.Classification(confidence=-1),
                ]
            ),
            filepath="one.png",
            group=group.element("one"),
            numeric=1,
            string="one",
        )
        two = fo.Sample(
            classifications=fo.Classifications(
                classifications=[
                    fo.Classification(label="two"),
                    fo.Classification(confidence=2),
                    fo.Classification(confidence=-2),
                ]
            ),
            filepath="two.png",
            group=group.element("two"),
            numeric=2,
            string="two",
        )
        dataset.add_samples([one, two])

        query = """
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on FloatLightningResult {
                        path
                        min
                        max
                    }
                    ... on IntLightningResult {
                        path
                        min
                        max
                    }
                    ... on StringLightningResult {
                        path
                        values
                    }
                }
            }
        """

        # only query "one" slice samples
        result = await _execute(
            query,
            dataset,
            (fo.FloatField, fo.IntField, fo.StringField),
            [
                "classifications.classifications.confidence",
                "classifications.classifications.label",
                "numeric",
                "string",
            ],
            frames=False,
            slice="one",
        )

        self.assertListEqual(
            result.data["lightning"],
            [
                {
                    "path": "classifications.classifications.confidence",
                    "min": -1.0,
                    "max": 1.0,
                },
                {
                    "path": "classifications.classifications.label",
                    "values": ["one", "two"],
                },
                {"path": "numeric", "min": 1.0, "max": 1.0},
                {"path": "string", "values": ["one"]},
            ],
        )

        # only query "two" slice samples
        result = await _execute(
            query,
            dataset,
            (fo.FloatField, fo.IntField, fo.StringField),
            [
                "classifications.classifications.confidence",
                "classifications.classifications.label",
                "numeric",
                "string",
            ],
            frames=False,
            slice="two",
        )

        self.assertListEqual(
            result.data["lightning"],
            [
                {
                    "path": "classifications.classifications.confidence",
                    "min": -2.0,
                    "max": 2.0,
                },
                {
                    "path": "classifications.classifications.label",
                    "values": ["one", "two"],
                },
                {"path": "numeric", "min": 2.0, "max": 2.0},
                {"path": "string", "values": ["two"]},
            ],
        )


class TestObjectIdLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_object_ids(self, dataset: fo.Dataset):
        keys = _add_samples(dataset, dict(id="0" * 24))
        query = """
            query Query($input: LightningInput!) {
                lightning(input: $input) {
                    ... on ObjectIdLightningResult {
                        path
                        values
                    }
                }
            }
        """

        result = await _execute(
            query,
            dataset,
            fo.ObjectIdField,
            keys,
            frames=False,
            search="0" * 25,
        )

        for path in result.data["lightning"]:
            if path["path"] == "id":
                self.assertEqual(len(path["values"]), 1)
            else:
                self.assertListEqual(
                    path["values"], ["000000000000000000000000"]
                )

        result = await _execute(
            query,
            dataset,
            fo.ObjectIdField,
            keys,
            frames=False,
            search="Z" * 25,
        )

        for path in result.data["lightning"]:
            self.assertListEqual(path["values"], [])


def _add_samples(dataset: fo.Dataset, *sample_data: t.List[t.Dict]):
    samples = []
    keys = set()
    for idx, data in enumerate(sample_data):
        samples.append(_make_sample(f"{idx}.mp4", data))
        keys |= set(data.keys())

    dataset.add_samples(samples)
    dataset.add_dynamic_sample_fields()
    dataset.add_dynamic_frame_fields()
    return keys


async def _execute(
    query: str,
    dataset: fo.Dataset,
    field: fo.Field,
    keys: t.Set[str],
    frames=True,
    search: t.Optional[str] = None,
    slice: t.Optional[str] = None,
):
    return await execute(
        schema,
        query,
        {
            "input": asdict(
                LightningInput(
                    dataset=dataset.name,
                    paths=_get_paths(
                        dataset, field, keys, frames=frames, search=search
                    ),
                    slice=slice,
                )
            )
        },
    )


def _get_paths(
    dataset: fo.Dataset,
    field_type: t.Type[fo.Field],
    keys: t.Set[str],
    frames=True,
    search: t.Optional[str] = None,
):
    field_dict = dataset.get_field_schema(flat=True)

    if frames:
        field_dict.update(
            **{
                f"frames.{path}": field
                for path, field in dataset.get_frame_field_schema(
                    flat=True
                ).items()
            }
        )

    paths: t.List[LightningPathInput] = []
    for path in sorted(field_dict):
        field = field_dict[path]
        if isinstance(field, fo.ListField):
            field = field.field

        if not isinstance(field, field_type):
            continue

        if all([key not in path for key in keys]):
            continue

        dataset.create_index(path)
        paths.append(LightningPathInput(path=path, search=search))

    return paths


def _make_data(data):
    return dict(
        classification=fo.Classification(**data),
        detections=fo.Detections(detections=[fo.Detection(**data)]),
        **data,
    )


def _make_sample(filepath: str, data: t.Dict):
    sample = fo.Sample(filepath=filepath, **_make_data(data))
    sample.frames[1] = fo.Frame(frame_number=1, **_make_data(data))
    return sample
