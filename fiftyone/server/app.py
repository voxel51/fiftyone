"""
FiftyOne Server app.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import pathlib
import stat

import eta.core.utils as etau
from starlette.applications import Starlette
from starlette.datastructures import Headers
from starlette.middleware import Middleware
from starlette.middleware.base import (
    BaseHTTPMiddleware,
    RequestResponseEndpoint,
)
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, RedirectResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import NotModifiedResponse, PathLike, StaticFiles
from starlette.types import Scope
import strawberry as gql

import fiftyone as fo
import fiftyone.constants as foc
from fiftyone.server.constants import SCALAR_OVERRIDES
from fiftyone.server.context import GraphQL
from fiftyone.server.extensions import EndSession
from fiftyone.server.mutation import Mutation
from fiftyone.server.query import Query
from fiftyone.server.routes import routes


etau.ensure_dir(os.path.join(os.path.dirname(__file__), "static"))


class Static(StaticFiles):
    def file_response(
        self,
        full_path: PathLike,
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        method = scope["method"]
        request_headers = Headers(scope=scope)

        response = FileResponse(
            full_path,
            status_code=status_code,
            stat_result=stat_result,
            method=method,
        )
        if response.path.endswith("index.html"):
            response.headers["cache-control"] = "no-store"
        elif self.is_not_modified(response.headers, request_headers):
            return NotModifiedResponse(response.headers)

        return response

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 404:
            parts = pathlib.Path(path).parts
            path = pathlib.Path(*parts[1:])
            if parts and parts[0] == "datasets":
                full_path, stat_result = self.lookup_path(path)
                if stat_result and stat.S_ISREG(stat_result.st_mode):
                    return self.file_response(full_path, stat_result, scope)

                if len(parts) == 2:
                    full_path, stat_result = self.lookup_path("index.html")
                    return self.file_response(full_path, stat_result, scope)

            return RedirectResponse(url="/")

        return response


class HeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        response.headers["x-colab-notebook-cache-control"] = "no-cache"
        return response


schema = gql.Schema(
    mutation=Mutation,
    query=Query,
    extensions=[EndSession],
    scalar_overrides=SCALAR_OVERRIDES,
)


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
    debug=True,
    routes=[Route(route, endpoint) for route, endpoint in routes]
    + [
        Route(
            "/graphql",
            GraphQL(
                schema,
                graphiql=foc.DEV_INSTALL,
            ),
        ),
        Mount(
            "/plugins",
            app=Static(
                directory=fo.config.plugins_dir,
                html=True,
                check_dir=False,
                follow_symlink=True,
            ),
            name="plugins",
        ),
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
