"""
FiftyOne Server routes

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .aggregate import Aggregate
from .embeddings import EmbeddingsRoutes
from .event import Event
from .events import Events
from .fiftyone import FiftyOne
from .frames import Frames
from .media import Media
from .plugins import Plugins
from .sort import Sort
from .screenshot import Screenshot
from .tag import Tag
from .tagging import Tagging
from .values import Values
from fiftyone.operators.server import OperatorRoutes

# Starlette routes should not be created here. Please leave as tuple definitions
routes = (
    EmbeddingsRoutes
    + OperatorRoutes
    + [
        ("/aggregate", Aggregate),
        ("/event", Event),
        ("/events", Events),
        ("/fiftyone", FiftyOne),
        ("/frames", Frames),
        ("/media", Media),
        ("/plugins", Plugins),
        ("/sort", Sort),
        ("/screenshot/{img:str}", Screenshot),
        ("/tag", Tag),
        ("/tagging", Tagging),
        ("/values", Values),
    ]
)
