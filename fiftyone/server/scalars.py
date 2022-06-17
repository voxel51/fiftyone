"""
FiftyOne Server GraphQL scalars

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import json_util
import json
import typing as t

import strawberry as gql

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
    serialize=lambda v: v,
    parse_value=lambda v: v,
)

JSONArray = gql.scalar(
    t.NewType("JSONArray", object),
    serialize=lambda v: v,
    parse_value=lambda v: v,
)
