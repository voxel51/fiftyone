"""
FiftyOne Teams schema.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql

from .types import Query
from .mutations import Mutation

schema = gql.Schema(query=Query, mutation=Mutation)
