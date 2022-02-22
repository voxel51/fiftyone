"""
FiftyOne Server routes

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .aggregations import Aggregations
from .colorscales import Colorscales
from .dataset import Dataset
from .distributions import Distributions
from .export import Export
from .fiftyone import FiftyOne
from .frames import Frames
from .media import Media
from .notebook import Notebook
from .pin import Pin
from .samples import Samples
from .select import Select
from .session import Session
from .sidebar import Sidebar
from .sort import Sort
from .stages import Stages
from .state import state
from .tag import Tag
from .tagging import Tagging
from .teams import Teams
from .update import Update
from .values import Values


routes = [
    ("/aggregations", Aggregations),
    ("/coloscales", Colorscales),
    ("/dataset", Dataset),
    ("/distributions", Distributions),
    ("/export", Export),
    ("/fiftyone", FiftyOne),
    ("/frames", Frames),
    ("/media", Media),
    ("/notebook", Notebook),
    ("/pin", Pin),
    ("/samples", Samples),
    ("/select", Select),
    ("/session", Session),
    ("/sidebar", Sidebar),
    ("/sort", Sort),
    ("/stages", Stages),
    ("/state", state),
    ("/tag", Tag),
    ("/tagging", Tagging),
    ("/teams", Teams),
    ("/update", Update),
    ("/values", Values),
]
