"""
FiftyOne Server GraphQL scalars

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import strawberry as gql

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
