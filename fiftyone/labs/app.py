"""
FiftyOne Teams main.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import starlette.applications as stra
from starlette.middleware.cors import CORSMiddleware
import strawberry.asgi as gqla

import fiftyone.constants as foc

from .context import on_shutdown, on_startup
from .schema import schema


app = stra.Starlette(on_shutdown=[on_shutdown], on_startup=[on_startup])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=[
        "access-control-allow-origin",
        "authorization",
        "content-type",
    ],
)
app.add_route("/graphql", gqla.GraphQL(schema, graphiql=foc.DEV_INSTALL))
