"""
FiftyOne Server routes

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.routing import Route

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
    Route("/aggregations", Aggregations),
    Route("/coloscales", Colorscales),
    Route("/dataset", Dataset),
    Route("/distributions", Distributions),
    Route("/export", Export),
    Route("/fiftyone", FiftyOne),
    Route("/frames", Frames),
    Route("/media", Media),
    Route("/notebook", Notebook),
    Route("/pin", Pin),
    Route("/samples", Samples),
    Route("/select", Select),
    Route("/session", Session),
    Route("/sidebar", Sidebar),
    Route("/sort", Sort),
    Route("/stages", Stages),
    Route("/state", state),
    Route("/tag", Tag),
    Route("/tagging", Tagging),
    Route("/teams", Teams),
    Route("/update", Update),
    Route("/values", Values),
]
