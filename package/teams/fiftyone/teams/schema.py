"""
FiftyOne Teams schema

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql

from fiftyone.server.extensions import EndSession

from fiftyone.teams.mutation import Mutation
from fiftyone.teams.query import Query


schema = gql.Schema(query=Query, mutation=Mutation, extensions=[EndSession])
