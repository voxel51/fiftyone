"""
Multimodal scaffolding for shared contracts and extension points.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from . import adapters, decoders, resolver, server
from . import schemas
from .adapters import MultimodalAdapter
from .decoders import (
    DecodedIngestFields,
    DecodedIngestValue,
    MultimodalDecoder,
    MultimodalPayload,
    PayloadDescriptorKey,
    clear_decoders,
    get_decoder,
    list_decoders,
    register_decoder,
)
from .resolver import PlaybackPlanBuilder

__all__ = [
    "DecodedIngestFields",
    "DecodedIngestValue",
    "MultimodalAdapter",
    "MultimodalDecoder",
    "MultimodalPayload",
    "PayloadDescriptorKey",
    "PlaybackPlanBuilder",
    "adapters",
    "clear_decoders",
    "decoders",
    "get_decoder",
    "list_decoders",
    "register_decoder",
    "resolver",
    "schemas",
    "server",
]
