"""
Browser-safe media-reference sample transport validation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.multimodal.media import _validate_media_reference_descriptor


def validate_sample_for_transport(sample):
    """Validates a public descriptor and returns ``sample`` unchanged.

    This function does not redact the input. Invalid media-reference
    descriptors raise before the sample is transported.
    """
    if not isinstance(sample, dict):
        return sample

    descriptor = sample.get("media_reference", None)
    if descriptor is None:
        return sample

    _validate_media_reference_descriptor(descriptor)
    return sample
