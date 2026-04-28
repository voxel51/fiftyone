"""
Registry helpers for multimodal decoders.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from threading import RLock
from typing import NamedTuple

from fiftyone.multimodal.schemas.v1 import PayloadDescriptor

from .base import MultimodalDecoder


class PayloadDescriptorKey(NamedTuple):
    """Hashable decoder registry key for a payload descriptor."""

    encoding: str
    schema_encoding: str | None
    schema: str | None


_DECODERS: dict[PayloadDescriptorKey, MultimodalDecoder] = {}
_DECODERS_LOCK = RLock()


def register_decoder(decoder: MultimodalDecoder) -> MultimodalDecoder:
    """Registers a multimodal decoder by payload descriptor."""

    with _DECODERS_LOCK:
        key = _payload_key(decoder.payload)

        if key in _DECODERS:
            # Omit unset optional descriptor parts so errors stay readable.
            formatted_key = "/".join(
                part
                for part in (key.encoding, key.schema_encoding, key.schema)
                if part
            )
            raise ValueError(
                f"Decoder for {formatted_key} is already registered: {_DECODERS[key]!r}"
            )

        _DECODERS[key] = decoder

    return decoder


def get_decoder(payload: PayloadDescriptor) -> MultimodalDecoder | None:
    """Returns a registered decoder by payload descriptor, if present."""

    with _DECODERS_LOCK:
        return _DECODERS.get(_payload_key(payload))


def list_decoders() -> dict[PayloadDescriptorKey, MultimodalDecoder]:
    """Returns a copy of the registered decoder mapping."""

    with _DECODERS_LOCK:
        return _DECODERS.copy()


def clear_decoders() -> None:
    """Clears all registered decoder entries."""

    with _DECODERS_LOCK:
        _DECODERS.clear()


def _payload_key(payload: PayloadDescriptor) -> PayloadDescriptorKey:
    # Normalize unset proto optionals to None for stable registry keys.
    schema = payload.schema if payload.HasField("schema") else None
    schema_encoding = (
        payload.schema_encoding
        if payload.HasField("schema_encoding")
        else None
    )
    return PayloadDescriptorKey(
        encoding=payload.encoding,
        schema_encoding=schema_encoding,
        schema=schema,
    )
