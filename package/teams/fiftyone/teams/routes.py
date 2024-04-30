"""
FiftyOne Teams Server routes.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.server.routes import (
    Aggregate,
    EmbeddingsRoutes,
    Frames,
    Plugins,
    Sort,
    Tag,
    Tagging,
    Values,
)
from fiftyone.operators.server import OperatorRoutes


NEEDS_EDIT = {
    Tag: lambda _: True,
    Sort: lambda v: v["extended"].get("dist_field", None) is not None,
}


# Starlette routes should not be created here. Please leave as tuple definitions
routes = (
    EmbeddingsRoutes
    + OperatorRoutes
    + [
        ("/aggregate", Aggregate),
        ("/frames", Frames),
        ("/plugins", Plugins),
        ("/sort", Sort),
        ("/tag", Tag),
        ("/tagging", Tagging),
        ("/values", Values),
    ]
)
