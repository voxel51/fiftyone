"""
FiftyOne internal utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def is_remote_service():
    """Whether the SDK is running in a remote service context.

    Returns:
        True/False
    """
    return has_encryption_key() and has_api_key()


def has_encryption_key():
    """Whether the current environment has an encryption key.

    Returns:
        True/False
    """
    return False


def has_api_key():
    """Whether the current environment has an API key.

    Returns:
        True/False
    """
    return False
