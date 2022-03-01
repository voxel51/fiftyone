"""
FiftyOne Teams app

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import starlette.applications as stra
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

import fiftyone.constants as foc
from fiftyone.server.routes import routes

from fiftyone.teams.authentication import (
    authenticate_route,
    middleware as auth_middleware,
    on_shutdown,
    on_startup,
)
from fiftyone.teams.context import GraphQL
from fiftyone.teams.schema import schema


routes = [
    Route(route, authenticate_route(endpoint)) for route, endpoint in routes
]


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
    ]
    + auth_middleware,
    on_shutdown=[on_shutdown],
    on_startup=[on_startup],
    routes=routes
    + [
        Route("/graphql", GraphQL(schema, graphiql=foc.DEV_INSTALL)),
        Mount("/", app=StaticFiles(directory="static"), name="static"),
    ],
)
