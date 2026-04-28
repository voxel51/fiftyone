"""
Base interfaces for multimodal decoders.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import abc
from collections.abc import Mapping
from typing import Any, Union

from fiftyone.multimodal.schemas.v1 import PayloadDescriptor

MultimodalPayload = Union[bytes, bytearray, memoryview]
"""Encoded payload accepted by SDK decoder implementations."""

DecodedIngestValue = Any
DecodedIngestFields = Mapping[str, DecodedIngestValue]
"""Decoded fields emitted by SDK decoders for cold-path ingest."""


class MultimodalDecoder(abc.ABC):
    """Abstract SDK decoder interface for cold-path ingest."""

    @property
    @abc.abstractmethod
    def payload(self) -> PayloadDescriptor:
        """Returns the encoded payload descriptor this decoder accepts."""

    @abc.abstractmethod
    def decode_payload(
        self, payload: MultimodalPayload
    ) -> DecodedIngestFields:
        """Decodes a single payload into ingestable fields."""
