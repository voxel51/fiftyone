"""
FiftyOne Server app

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import fiftyone.constants as foc
import strawberry as gql
from fiftyone.server.context import GraphQL
from fiftyone.server.extensions import EndSession
from fiftyone.server.mutation import Mutation
from fiftyone.server.query import Query
from fiftyone.server.routes import routes
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import (
    BaseHTTPMiddleware,
    RequestResponseEndpoint,
)
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class Static(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)

        if response.status_code == 404:
            full_path, stat_result = await self.lookup_path("index.html")
            return self.file_response(full_path, stat_result, scope)

        return response


class HeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        response.headers["x-colab-notebook-cache-control"] = "no-cache"
        return response


schema = gql.Schema(mutation=Mutation, query=Query, extensions=[EndSession])


app = Starlette(
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
        ),
        Middleware(HeadersMiddleware),
    ],
    debug=foc.DEV_INSTALL,
    routes=[Route(route, endpoint) for route, endpoint in routes]
    + [
        Route("/graphql", GraphQL(schema, graphiql=foc.DEV_INSTALL)),
        Mount(
            "/",
            app=Static(
                directory=os.path.join(os.path.dirname(__file__), "static"),
                html=True,
            ),
            name="static",
        ),
    ],
)
