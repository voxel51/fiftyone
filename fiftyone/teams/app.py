"""
FiftyOne Teams main.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import starlette.applications as stra
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.routing import Route

import fiftyone.constants as foc

from fiftyone.server.routes import routes

from .context import on_shutdown, on_startup, GraphQL
from .schema import schema


app = stra.Starlette(
    debug=foc.DEV_INSTALL,
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
            allow_headers=[
                "access-control-allow-origin",
                "authorization",
                "content-type",
            ],
        )
    ],
    on_shutdown=[on_shutdown],
    on_startup=[on_startup],
    routes=routes
    + [Route("/graphql", GraphQL(schema, graphiql=foc.DEV_INSTALL))],
)
