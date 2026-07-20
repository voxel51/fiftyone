"""
Server scaffolding for multimodal workflows.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import TYPE_CHECKING

from .routes import (
    MultimodalRoutes,
    PlaybackPlanEndpoint,
    PROTOBUF_MEDIA_TYPE,
    SceneInventoryEndpoint,
)

if TYPE_CHECKING:
    from fiftyone.server.routes.temporal_tags import (
        SampleTagsEndpoint,
        TagCountsEndpoint,
        TagsEndpoint,
    )

__all__ = [
    "MultimodalRoutes",
    "PlaybackPlanEndpoint",
    "PROTOBUF_MEDIA_TYPE",
    "SampleTagsEndpoint",
    "SceneInventoryEndpoint",
    "TagCountsEndpoint",
    "TagsEndpoint",
]


_TEMPORAL_TAG_EXPORTS = {
    "SampleTagsEndpoint",
    "TagCountsEndpoint",
    "TagsEndpoint",
}


def __getattr__(name):
    if name in _TEMPORAL_TAG_EXPORTS:
        from fiftyone.server.routes import (  # pylint: disable=import-outside-toplevel
            temporal_tags,
        )

        return getattr(temporal_tags, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
