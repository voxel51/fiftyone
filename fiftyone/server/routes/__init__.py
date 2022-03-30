"""
FiftyOne Server routes

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .aggregations import Aggregations
from .colorscales import Colorscales
from .distributions import Distributions
from .event import Event
from .events import Events
from .export import Export
from .fiftyone import FiftyOne
from .frames import Frames
from .media import Media
from .pin import Pin
from .samples import Samples
from .select import Select
from .sidebar import Sidebar
from .sort import Sort
from .stages import Stages
from .tag import Tag
from .tagging import Tagging
from .teams import Teams
from .values import Values


routes = [
    ("/aggregations", Aggregations),
    ("/coloscales", Colorscales),
    ("/distributions", Distributions),
    ("/event", Event),
    ("/events", Events),
    ("/export", Export),
    ("/fiftyone", FiftyOne),
    ("/frames", Frames),
    ("/media", Media),
    ("/pin", Pin),
    ("/samples", Samples),
    ("/select", Select),
    ("/sidebar", Sidebar),
    ("/sort", Sort),
    ("/stages", Stages),
    ("/tag", Tag),
    ("/tagging", Tagging),
    ("/teams", Teams),
    ("/values", Values),
]
