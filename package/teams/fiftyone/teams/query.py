"""
FiftyOne Teams query

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql

import fiftyone.server.query as fosq

from fiftyone.teams.authorize import (
    IsAuthenticated,
    authorize_gql_class,
)


authorize_gql_class(fosq.Query)


@gql.type
class Query(fosq.Query):
    @gql.field(permission_classes=[IsAuthenticated])
    def teams_submission(self) -> bool:
        return True
