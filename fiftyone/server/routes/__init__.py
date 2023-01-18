"""
FiftyOne Server routes

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .aggregate import Aggregate
from .embeddings import Embeddings
from .event import Event
from .events import Events
from .fiftyone import FiftyOne
from .frames import Frames
from .media import Media
from .plugins import Plugins
from .samples import Samples
from .select import Select
from .sort import Sort
from .screenshot import Screenshot
from .stages import Stages
from .tag import Tag
from .tagging import Tagging
from .values import Values

routes = [
    ("/aggregate", Aggregate),
    ("/embeddings", Embeddings),
    ("/event", Event),
    ("/events", Events),
    ("/fiftyone", FiftyOne),
    ("/frames", Frames),
    ("/media", Media),
    ("/plugins", Plugins),
    ("/samples", Samples),
    ("/select", Select),
    ("/sort", Sort),
    ("/stages", Stages),
    ("/screenshot/{img:str}", Screenshot),
    ("/tag", Tag),
    ("/tagging", Tagging),
    ("/values", Values),
]
