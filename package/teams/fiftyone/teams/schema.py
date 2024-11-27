"""
FiftyOne Teams schema

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime

import strawberry as gql

from fiftyone.server.extensions import EndSession
from fiftyone.server.scalars import Date, DateTime

from fiftyone.teams.mutation import Mutation
from fiftyone.teams.query import Query


schema = gql.Schema(
    query=Query,
    mutation=Mutation,
    extensions=[EndSession],
    scalar_overrides={
        date: Date,
        datetime: DateTime,
    },
)
