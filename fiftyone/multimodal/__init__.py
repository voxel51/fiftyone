"""
Multimodal scaffolding for shared contracts and extension points.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from importlib import import_module

# Public decoder symbols are intentionally resolved through ``__getattr__`` so
# importing media-reference domain values does not load viewer dependencies.
# pylint: disable=undefined-all-variable

from .media import (
    DatasetRelativeLocation,
    InvalidMediaLocationError,
    LeRobotEpisode,
    LeRobotImageLocator,
    LeRobotV3Locator,
    LeRobotVideoLocator,
    MalformedMediaSourceError,
    MediaAsset,
    MediaAssetRole,
    MediaAssetSelector,
    MediaReference,
    MediaReferenceError,
    MediaSourceAuthorizationError,
    MissingMediaReferenceBindingError,
    MissingMediaRootError,
    MovedMediaRootError,
    RowInterval,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedLeRobotExportModeError,
    UnsupportedMediaReferenceOperation,
    UnsupportedLeRobotVersionError,
    VideoTimestampInterval,
    WholeFile,
)


_LAZY_ATTRIBUTES = {
    "DecodedIngestFields": ("decoders", "DecodedIngestFields"),
    "DecodedIngestValue": ("decoders", "DecodedIngestValue"),
    "MultimodalDecoder": ("decoders", "MultimodalDecoder"),
    "MultimodalPayload": ("decoders", "MultimodalPayload"),
    "PayloadDescriptorKey": ("decoders", "PayloadDescriptorKey"),
    "PlaybackPlanBuilder": ("resolver", "PlaybackPlanBuilder"),
    "clear_decoders": ("decoders", "clear_decoders"),
    "get_decoder": ("decoders", "get_decoder"),
    "list_decoders": ("decoders", "list_decoders"),
    "register_decoder": ("decoders", "register_decoder"),
}
_LAZY_MODULES = {"decoders", "resolver", "schemas", "server"}


def __getattr__(name):
    if name in _LAZY_MODULES:
        value = import_module(".%s" % name, __name__)
        globals()[name] = value
        return value

    target = _LAZY_ATTRIBUTES.get(name)
    if target is not None:
        module_name, attribute_name = target
        module = import_module(".%s" % module_name, __name__)
        value = getattr(module, attribute_name)
        globals()[name] = value
        return value

    raise AttributeError("module %r has no attribute %r" % (__name__, name))


__all__ = [
    "DecodedIngestFields",
    "DecodedIngestValue",
    "DatasetRelativeLocation",
    "InvalidMediaLocationError",
    "LeRobotEpisode",
    "LeRobotImageLocator",
    "LeRobotV3Locator",
    "LeRobotVideoLocator",
    "MalformedMediaSourceError",
    "MediaAsset",
    "MediaAssetRole",
    "MediaAssetSelector",
    "MediaReference",
    "MediaReferenceError",
    "MediaSourceAuthorizationError",
    "MissingMediaReferenceBindingError",
    "MissingMediaRootError",
    "MultimodalDecoder",
    "MultimodalPayload",
    "PayloadDescriptorKey",
    "PlaybackPlanBuilder",
    "MovedMediaRootError",
    "RowInterval",
    "StaleMediaReferenceError",
    "UnfinalizedMediaSourceError",
    "UnsupportedLeRobotExportModeError",
    "UnsupportedMediaReferenceOperation",
    "UnsupportedLeRobotVersionError",
    "VideoTimestampInterval",
    "WholeFile",
    "clear_decoders",
    "decoders",
    "get_decoder",
    "list_decoders",
    "register_decoder",
    "resolver",
    "schemas",
    "server",
]
