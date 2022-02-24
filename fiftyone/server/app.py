"""
FiftyOne Server app

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql
from starlette.applications import Starlette
from starlette.routing import Route

import fiftyone.constants as foc

from fiftyone.server.context import GraphQL
from fiftyone.server.extensions import EndSession
from fiftyone.server.query import Query
from fiftyone.server.routes import routes


schema = gql.Schema(query=Query, extensions=[EndSession])


app = Starlette(
    debug=foc.DEV_INSTALL,
    routes=[Route(route, endpoint) for route, endpoint in routes]
    + [Route("/graphql", GraphQL(schema, graphiql=foc.DEV_INSTALL))],
)
