"""
FiftyOne Server expected exceptions

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import strawberry as gql


class DbVersionMismatchError(Exception):
    """Raised when a sample update conflicts with the current state."""

    def __init__(self, sample):
        self.sample = sample


@gql.type
class QueryTimeout:
    query_time: int


@gql.type
class AggregationQueryTimeout(QueryTimeout):
    path: str
