"""
FiftyOne internal utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

from fiftyone.internal.constants import API_URL_ENV_VAR, ENCRYPTION_KEY_ENV_VAR


def is_internal_service():
    """Whether the SDK is running in an internal service context.

    Returns:
        True/False
    """
    val = os.environ.get("FIFTYONE_INTERNAL_SERVICE", "")
    return val.lower() in ("true", "1")


def has_encryption_key():
    """Whether the current environment has an encryption key.

    Returns:
        True/False
    """
    return is_internal_service() and ENCRYPTION_KEY_ENV_VAR in os.environ


def get_api_url():
    # use `or` to default to localhost if envar is falsy
    return os.getenv(API_URL_ENV_VAR) or "http://localhost:8000"
