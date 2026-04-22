"""
Base interfaces for multimodal decoders.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc


class MultimodalDecoder(abc.ABC):
    """Abstract decoder interface for multimodal stream payloads."""

    @property
    @abc.abstractmethod
    def name(self):
        """Returns the stable decoder name."""

    @abc.abstractmethod
    def decode_message(self, message):
        """Decodes a single multimodal payload."""
