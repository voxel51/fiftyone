"""
Registry helpers for multimodal decoders.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from threading import RLock

from .base import MultimodalDecoder

_DECODERS: dict[str, MultimodalDecoder] = {}
_DECODERS_LOCK = RLock()


def register_decoder(
    name: str, decoder: MultimodalDecoder
) -> MultimodalDecoder:
    """Registers a multimodal decoder by name."""

    with _DECODERS_LOCK:
        if name in _DECODERS:
            raise ValueError(
                f"Decoder {name!r} is already registered: "
                f"{_DECODERS[name]!r}"
            )

        _DECODERS[name] = decoder

    return decoder


def get_decoder(name: str) -> MultimodalDecoder | None:
    """Returns a registered decoder by name, if present."""

    with _DECODERS_LOCK:
        return _DECODERS.get(name)


def list_decoders() -> dict[str, MultimodalDecoder]:
    """Returns a copy of the registered decoder mapping."""

    with _DECODERS_LOCK:
        return _DECODERS.copy()


def clear_decoders() -> None:
    """Clears all registered decoder entries."""

    with _DECODERS_LOCK:
        _DECODERS.clear()
