"""
FiftyOne Teams schema

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql

from fiftyone.server.extensions import EndSession

from .mutation import Mutation
from .query import Query


schema = gql.Schema(query=Query, mutation=Mutation, extensions=[EndSession])
