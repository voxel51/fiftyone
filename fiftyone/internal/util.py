"""
FiftyOne internal utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def is_internal_service():
    """Whether the SDK is running in an internal service context.

    Returns:
        True/False
    """
    return False


def has_encryption_key():
    """Whether the current environment has an encryption key.

    Returns:
        True/False
    """
    return False
