"""
FiftyOne Server app.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
import os
import pathlib
import stat
import mimetypes
import eta.core.utils as etau
import strawberry as gql
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

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.config as focfg
import fiftyone.core.context as focx
from fiftyone.operators.store.notification_service import (
    MongoChangeStreamNotificationServiceLifecycleManager,
    default_notification_service,
    is_notification_service_disabled,
)
from fiftyone.server.constants import SCALAR_OVERRIDES
from fiftyone.server.context import GraphQL
from fiftyone.server.extensions import EndSession
from fiftyone.server.mutation import Mutation
from fiftyone.server.query import Query
from fiftyone.server.routes import routes

logger = logging.getLogger(__name__)


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
        # Enable cross-origin isolation for multi-threaded WASM
        # (SharedArrayBuffer).
        # Skipped in notebook/iframe contexts (Jupyter, Colab) where
        # COOP: same-origin would prevent the app from loading inside
        # the iframe.
        if not focx.is_notebook_context():
            response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
            response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
        return response


schema = gql.Schema(
    mutation=Mutation,
    query=Query,
    extensions=[EndSession],
    scalar_overrides=SCALAR_OVERRIDES,
)

mtypes = (  # ensure mimetypes for Windows
    ('application/javascript', '.js'),
    ('text/css', '.css'),
    ('application/wasm', '.wasm'),
)
for mtype, ext in mtypes:
    mimetypes.add_type(mtype, ext)

app = Starlette(
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["GET", "PATCH", "POST", "HEAD", "OPTIONS"],
            allow_headers=[
                "access-control-allow-origin",
                "authorization",
                "content-type",
                "if-match",
            ],
        ),
        Middleware(HeadersMiddleware),
    ],
    debug=True,
    routes=[Route(route, endpoint) for route, endpoint in routes]
    + [
        Route(
            "/graphql",
            GraphQL(schema),
        ),
        Mount(
            "/plugins",
            app=Static(
                directory=focfg.load_config().plugins_dir,
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
                follow_symlink=True,
            ),
            name="static",
        ),
    ],
)


@app.on_event("startup")
async def startup_event():
    if is_notification_service_disabled():
        logger.info("Execution Store notification service is disabled")
        return

    app.state.lifecycle_manager = (
        MongoChangeStreamNotificationServiceLifecycleManager(
            default_notification_service
        )
    )
    app.state.lifecycle_manager.start_in_dedicated_thread()


@app.on_event("shutdown")
async def shutdown_event():
    if hasattr(app.state, "lifecycle_manager") and app.state.lifecycle_manager:
        logger.info("Shutting down notification service...")
        try:
            await asyncio.wait_for(
                app.state.lifecycle_manager.stop(), timeout=5
            )
            logger.info("Notification service shutdown complete")
        except asyncio.TimeoutError:
            logger.warning(
                "Notification service shutdown timed out after 5 seconds"
            )
        except Exception as e:
            logger.exception(
                f"Error during notification service shutdown: {e}"
            )
