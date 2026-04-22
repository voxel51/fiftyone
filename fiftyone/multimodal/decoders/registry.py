"""
Registry helpers for multimodal decoders.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


_DECODERS = {}


def register_decoder(name, decoder):
    """Registers a multimodal decoder by name."""

    _DECODERS[name] = decoder
    return decoder


def get_decoder(name):
    """Returns a registered decoder by name, if present."""

    return _DECODERS.get(name)


def list_decoders():
    """Returns a copy of the registered decoder mapping."""

    return dict(_DECODERS)


def clear_decoders():
    """Clears all registered decoder entries."""

    _DECODERS.clear()
