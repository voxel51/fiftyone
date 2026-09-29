"""
FiftyOne Server GraphQL scalars

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import date, datetime
from bson import json_util
import json
import strawberry as gql
import typing as t

from fiftyone.core.json import stringify
from fiftyone.core.utils import datetime_to_timestamp, timestamp_to_datetime

BSON = t.NewType("BSON", object)
BSONArray = t.NewType("BSONArray", object)
JSON = t.NewType("JSON", object)
JSONArray = t.NewType("JSONArray", object)

DateTime = gql.scalar(
    name="datetime",
    serialize=lambda v: datetime_to_timestamp(v),
    parse_value=lambda v: timestamp_to_datetime(v),
)

Date = gql.scalar(
    name="date",
    serialize=lambda v: datetime_to_timestamp(v),
    parse_value=lambda v: timestamp_to_datetime(v),
)

SCALAR_MAP = {
    BSON: gql.scalar(
        name="BSON",
        serialize=lambda v: json.loads(json_util.dumps(v)),
        parse_value=lambda v: json_util.loads(json.dumps(v)),
    ),
    BSONArray: gql.scalar(
        name="BSONArray",
        serialize=lambda v: json.loads(json_util.dumps(v)),
        parse_value=lambda v: json_util.loads(json.dumps(v)),
    ),
    JSON: gql.scalar(
        name="JSON",
        serialize=lambda v: stringify(v),
        parse_value=lambda v: v,
    ),
    JSONArray: gql.scalar(
        name="JSONArray",
        serialize=lambda v: json.loads(json_util.dumps(v)),
        parse_value=lambda v: json_util.loads(json.dumps(v)),
    ),
    date: Date,
    datetime: DateTime,
}
