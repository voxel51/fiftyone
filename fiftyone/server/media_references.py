"""
Browser-safe media-reference sample transport.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.multimodal.media import (
    MediaReferenceError,
    sanitize_media_reference,
)


def sanitize_sample_for_transport(sample):
    """Redacts a sample's private reference payload for browser transport."""
    if not isinstance(sample, dict):
        return sample

    envelope = sample.get("_media_reference", None)
    if envelope is None:
        return sample

    if isinstance(envelope, dict) and set(envelope) == {
        "kind",
        "key",
        "version",
    }:
        if not all(
            isinstance(envelope[field], str) and envelope[field]
            for field in ("kind", "key", "version")
        ):
            raise MediaReferenceError(
                "Malformed sanitized media-reference descriptor"
            )

        return sample

    sample = dict(sample)
    descriptor = sanitize_media_reference(envelope)
    sample["_media_reference"] = descriptor
    sample["_media_type"] = envelope["media_type"]
    return sample
