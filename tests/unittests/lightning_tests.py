"""
FiftyOne Server lightning tests.

| Copyright 2017-2024, Voxel51, Inc.
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
                        false
                        path
                        true
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.BooleanField, keys)
        self.assertListEqual(
            result.data["lightning"],
            [
                {"false": True, "path": "bool", "true": True},
                {"false": True, "path": "bool_list", "true": True},
                {"false": True, "path": "classification.bool", "true": True},
                {
                    "false": True,
                    "path": "classification.bool_list",
                    "true": True,
                },
                {"false": True, "path": "classification.none", "true": False},
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
                {"false": True, "path": "frames.bool", "true": True},
                {"false": True, "path": "frames.bool_list", "true": True},
                {
                    "false": True,
                    "path": "frames.classification.bool",
                    "true": True,
                },
                {
                    "false": True,
                    "path": "frames.classification.bool_list",
                    "true": True,
                },
                {
                    "false": True,
                    "path": "frames.classification.none",
                    "true": False,
                },
                {
                    "false": True,
                    "path": "frames.detections.detections.bool",
                    "true": True,
                },
                {
                    "false": True,
                    "path": "frames.detections.detections.bool_list",
                    "true": True,
                },
                {
                    "false": True,
                    "path": "frames.detections.detections.none",
                    "true": False,
                },
                {"false": True, "path": "frames.none", "true": False},
                {"false": True, "path": "none", "true": False},
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
                        max
                        min
                        path
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.DateField, keys)
        self.assertListEqual(
            result.data["lightning"],
            [
                {"max": 978307200000.0, "min": 946684800000.0, "path": "date"},
                {
                    "max": 978307200000.0,
                    "min": 946684800000.0,
                    "path": "date_list",
                },
                {
                    "max": 978307200000.0,
                    "min": 946684800000.0,
                    "path": "frames.date",
                },
                {
                    "max": 978307200000.0,
                    "min": 946684800000.0,
                    "path": "frames.date_list",
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
                        max
                        min
                        path
                    }
                }
            }
        """

        result = await _execute(query, dataset, fo.DateTimeField, keys)
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
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "path": "frames.classification.datetime",
                },
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "path": "frames.classification.datetime_list",
                },
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "path": "frames.datetime",
                },
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "path": "frames.datetime_list",
                },
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "path": "frames.detections.detections.datetime",
                },
                {
                    "max": 978393599000.0,
                    "min": 946691999000.0,
                    "path": "frames.detections.detections.datetime_list",
                },
            ],
        )


class TestFloatLightningQueries(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_floats(self, dataset: fo.Dataset):
        keys = _add_samples(
            dataset,
            dict(
                float=-1.0,
                float_list=[-1.0],
                inf=float("-inf"),
                inf_list=float("-inf"),
                nan=float("nan"),
                nan_list=[float("nan")],
            ),
            dict(
                float=1.0,
                float_list=[1.0],
                inf=float("inf"),
                inf_list=float("inf"),
            ),
        )

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

        result = await _execute(query, dataset, fo.FloatField, keys)
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
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "path": "frames.classification.float",
                    "nan": False,
                    "ninf": False,
                },
                {
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "path": "frames.classification.float_list",
                    "nan": False,
                    "ninf": False,
                },
                {
                    "inf": True,
                    "max": None,
                    "min": None,
                    "path": "frames.classification.inf",
                    "nan": False,
                    "ninf": True,
                },
                {
                    "inf": True,
                    "max": None,
                    "min": None,
                    "path": "frames.classification.inf_list",
                    "nan": False,
                    "ninf": True,
                },
                {
                    "inf": False,
                    "max": None,
                    "min": None,
                    "path": "frames.classification.nan",
                    "nan": True,
                    "ninf": False,
                },
                {
                    "inf": False,
                    "max": None,
                    "min": None,
                    "path": "frames.classification.nan_list",
                    "nan": True,
                    "ninf": False,
                },
                {
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "path": "frames.detections.detections.float",
                    "nan": False,
                    "ninf": False,
                },
                {
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "path": "frames.detections.detections.float_list",
                    "nan": False,
                    "ninf": False,
                },
                {
                    "inf": True,
                    "max": None,
                    "min": None,
                    "path": "frames.detections.detections.inf",
                    "nan": False,
                    "ninf": True,
                },
                {
                    "inf": True,
                    "max": None,
                    "min": None,
                    "path": "frames.detections.detections.inf_list",
                    "nan": False,
                    "ninf": True,
                },
                {
                    "inf": False,
                    "max": None,
                    "min": None,
                    "path": "frames.detections.detections.nan",
                    "nan": True,
                    "ninf": False,
                },
                {
                    "inf": False,
                    "max": None,
                    "min": None,
                    "path": "frames.detections.detections.nan_list",
                    "nan": True,
                    "ninf": False,
                },
                {
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "path": "frames.float",
                    "nan": False,
                    "ninf": False,
                },
                {
                    "inf": False,
                    "max": 1.0,
                    "min": -1.0,
                    "path": "frames.float_list",
                    "nan": False,
                    "ninf": False,
                },
                {
                    "inf": True,
                    "max": None,
                    "min": None,
                    "path": "frames.inf",
                    "nan": False,
                    "ninf": True,
                },
                {
                    "inf": True,
                    "max": None,
                    "min": None,
                    "path": "frames.inf_list",
                    "nan": False,
                    "ninf": True,
                },
                {
                    "inf": False,
                    "max": None,
                    "min": None,
                    "path": "frames.nan",
                    "nan": True,
                    "ninf": False,
                },
                {
                    "inf": False,
                    "max": None,
                    "min": None,
                    "path": "frames.nan_list",
                    "nan": True,
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
        keys = _add_samples(
            dataset,
            dict(
                str="lower",
                str_list=["lower"],
                none="none",
            ),
            upper=dict(
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


def _add_samples(dataset: fo.Dataset, lower: t.Dict, upper: t.Dict):
    one = _make_sample(
        "one.mp4",
        lower,
    )
    two = _make_sample(
        "two.mp4",
        upper,
    )
    dataset.add_samples([one, two])
    dataset.add_dynamic_sample_fields()
    dataset.add_dynamic_frame_fields()
    return set(lower.keys()) | set(upper.keys())


async def _execute(
    query: str, dataset: fo.Dataset, field: fo.Field, keys: t.Set[str]
):
    return await execute(
        schema,
        query,
        {
            "input": asdict(
                LightningInput(
                    dataset=dataset.name,
                    paths=_get_paths(dataset, field, keys),
                )
            )
        },
    )


def _get_paths(
    dataset: fo.Dataset, field_type: t.Type[fo.Field], keys: t.Set[str]
):
    field_dict = dataset.get_field_schema(flat=True)
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
        paths.append(LightningPathInput(path=path))
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
