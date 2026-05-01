"""
Server scaffolding for multimodal workflows.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .routes import (
    MultimodalRoutes,
    PROTOBUF_MEDIA_TYPE,
    SceneInventoryEndpoint,
)

__all__ = [
    "MultimodalRoutes",
    "PROTOBUF_MEDIA_TYPE",
    "SceneInventoryEndpoint",
]
