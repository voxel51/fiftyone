"""
FiftyOne Server routes

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.multimodal.server import MultimodalRoutes
from fiftyone.operators.server import OperatorRoutes

from .aggregate import Aggregate
from .camera import CameraRoutes
from .embeddings import EmbeddingsRoutes
from .event import Event
from .events import Events
from .features import Features
from .fiftyone import FiftyOne
from .frames import Frames
from .geo import GeoPoints
from .get_similar_labels_frames import GetSimilarLabelsFrameCollection
from .groups import GroupsRoutes
from .media import Media
from .ontology import OntologyAttributes, Ontologies
from .plugins import Plugins
from .runtime_assets import RuntimeAssetRoutes
from .sample import SampleRoutes
from .screenshot import Screenshot
from .sort import Sort
from .tag import Tag
from .tagging import Tagging
from .values import Values

# TODO: uncomment in integration PR to enable file upload/delete routes
# from .files import FileDelete, FileUpload

# Starlette routes should not be created here. Please leave as tuple definitions
routes = (
    CameraRoutes
    + EmbeddingsRoutes
    + GroupsRoutes
    + MultimodalRoutes
    + OperatorRoutes
    + RuntimeAssetRoutes
    + SampleRoutes
    + [
        ("/aggregate", Aggregate),
        ("/event", Event),
        ("/events", Events),
        ("/features", Features),
        ("/fiftyone", FiftyOne),
        ("/frames", Frames),
        ("/geo", GeoPoints),
        ("/media", Media),
        ("/ontologies/{name}/attributes", OntologyAttributes),
        ("/ontologies", Ontologies),
        ("/plugins", Plugins),
        ("/sort", Sort),
        ("/screenshot/{img:str}", Screenshot),
        ("/tag", Tag),
        ("/tagging", Tagging),
        ("/values", Values),
        ("/get-similar-labels-frames", GetSimilarLabelsFrameCollection),
        # TODO: uncomment in integration PR to enable file upload/delete routes
        # ("/files/upload", FileUpload),
        # ("/files", FileDelete),
    ]
)
