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
    Episode,
    EpisodeAsset,
    EpisodeAssetManifest,
    EpisodeResolver,
    LeRobotEpisode,
    MalformedMediaSourceError,
    MediaReference,
    MediaReferenceError,
    MissingMediaRootError,
    MovedMediaRootError,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedMediaReferenceOperation,
    UnsupportedMediaReferenceVersionError,
    get_episode_resolver,
    get_logical_media_identity,
    get_media_reference_kind,
    hydrate_media_reference,
    register_episode_resolver,
    register_media_reference,
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
    "Episode",
    "EpisodeAsset",
    "EpisodeAssetManifest",
    "EpisodeResolver",
    "LeRobotEpisode",
    "MalformedMediaSourceError",
    "MediaReference",
    "MediaReferenceError",
    "MissingMediaRootError",
    "MultimodalDecoder",
    "MultimodalPayload",
    "PayloadDescriptorKey",
    "PlaybackPlanBuilder",
    "MovedMediaRootError",
    "StaleMediaReferenceError",
    "UnfinalizedMediaSourceError",
    "UnsupportedMediaReferenceOperation",
    "UnsupportedMediaReferenceVersionError",
    "clear_decoders",
    "decoders",
    "get_decoder",
    "get_episode_resolver",
    "get_logical_media_identity",
    "get_media_reference_kind",
    "hydrate_media_reference",
    "list_decoders",
    "register_decoder",
    "register_episode_resolver",
    "register_media_reference",
    "resolver",
    "schemas",
    "sanitize_media_reference",
    "serialize_media_reference",
    "server",
    "validate_media_source",
]
