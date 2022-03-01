"""
FiftyOne Teams app

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import starlette.applications as stra
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

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


class Static(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)

        if response.status_code == 404:
            full_path, stat_result = await self.lookup_path("index.html")
            return self.file_response(full_path, stat_result, scope)

        return response


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
        Mount("/", app=Static(directory="static", html=True), name="static",),
    ],
)

import fiftyone as fo

print(fo.config)
