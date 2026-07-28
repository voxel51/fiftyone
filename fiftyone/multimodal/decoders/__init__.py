"""
Multimodal decoder scaffolding.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .base import (
    DecodedIngestFields,
    DecodedIngestValue,
    MultimodalDecoder,
    MultimodalPayload,
)
from .registry import (
    PayloadDescriptorKey,
    clear_decoders,
    get_decoder,
    list_decoders,
    register_decoder,
)


__all__ = [
    "DecodedIngestFields",
    "DecodedIngestValue",
    "MultimodalDecoder",
    "MultimodalPayload",
    "PayloadDescriptorKey",
    "clear_decoders",
    "get_decoder",
    "list_decoders",
    "register_decoder",
]
