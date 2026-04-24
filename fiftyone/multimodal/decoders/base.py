"""
Base interfaces for multimodal decoders.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import abc
from collections.abc import Mapping
from typing import Union, Any

MultimodalPayload = Union[bytes, bytearray, memoryview]
"""Encoded payload accepted by scaffold decoder implementations."""

DecodedFieldValue = Any
DecodedMessage = Mapping[str, DecodedFieldValue]
"""Broad decoded message shape until schema-specific outputs are finalized."""


class MultimodalDecoder(abc.ABC):
    """Abstract decoder interface for multimodal stream payloads."""

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Returns the stable decoder name."""

    @abc.abstractmethod
    def decode_message(self, message: MultimodalPayload) -> DecodedMessage:
        """Decodes a single multimodal payload."""
