"""
FiftyOne Server GraphQL scalars

| Copyright 2017-2025, Voxel51, Inc.
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


BSON = gql.scalar(
    t.NewType("BSON", object),
    serialize=lambda v: json.loads(json_util.dumps(v)),
    parse_value=lambda v: json_util.loads(json.dumps(v)),
)

BSONArray = gql.scalar(
    t.NewType("BSONArray", object),
    serialize=lambda v: json.loads(json_util.dumps(v)),
    parse_value=lambda v: json_util.loads(json.dumps(v)),
)

JSON = gql.scalar(
    t.NewType("JSON", object),
    serialize=lambda v: stringify(v),
    parse_value=lambda v: v,
)

JSONArray = gql.scalar(
    t.NewType("JSONArray", object),
    serialize=lambda v: json.loads(json_util.dumps(v)),
    parse_value=lambda v: json_util.loads(json.dumps(v)),
)

DateTime = gql.scalar(
    datetime,
    serialize=lambda v: datetime_to_timestamp(v),
    parse_value=lambda v: timestamp_to_datetime(v),
)


Date = gql.scalar(
    date,
    serialize=lambda v: datetime_to_timestamp(v),
    parse_value=lambda v: timestamp_to_datetime(v),
)
