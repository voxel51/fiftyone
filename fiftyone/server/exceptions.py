"""
FiftyOne Server expected exceptions

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import strawberry as gql


@gql.type
class QueryTimeout:
    query_time: int


@gql.type
class AggregationQueryTimeout(QueryTimeout):
    path: str
