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
    MediaAssetManifest,
    MediaAssetRole,
    MediaAssetSelector,
    MediaReference,
    MediaReferenceError,
    MediaResolver,
    MediaSourceAuthorizationError,
    MissingMediaRootError,
    MovedMediaRootError,
    RowInterval,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedLeRobotExportModeError,
    UnsupportedMediaReferenceOperation,
    UnsupportedMediaReferenceVersionError,
    VideoTimestampInterval,
    WholeFile,
    get_logical_media_identity,
    get_media_export_planner,
    get_media_resolver,
    get_media_reference_kind,
    get_selected_media_asset_key,
    get_shared_media_asset_key,
    hydrate_media_reference,
    register_media_export_planner,
    register_media_reference,
    register_media_resolver,
    sanitize_media_reference,
    serialize_media_reference,
    validate_media_source,
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
    "MediaAssetManifest",
    "MediaAssetRole",
    "MediaAssetSelector",
    "MediaReference",
    "MediaReferenceError",
    "MediaResolver",
    "MediaSourceAuthorizationError",
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
    "UnsupportedMediaReferenceVersionError",
    "VideoTimestampInterval",
    "WholeFile",
    "clear_decoders",
    "decoders",
    "get_decoder",
    "get_logical_media_identity",
    "get_media_export_planner",
    "get_media_resolver",
    "get_media_reference_kind",
    "get_selected_media_asset_key",
    "get_shared_media_asset_key",
    "hydrate_media_reference",
    "list_decoders",
    "register_decoder",
    "register_media_export_planner",
    "register_media_reference",
    "register_media_resolver",
    "resolver",
    "schemas",
    "sanitize_media_reference",
    "serialize_media_reference",
    "server",
    "validate_media_source",
]
