"""
FiftyOne internal utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

from fiftyone.internal.constants import (
    API_URL_ENV_VAR,
    ENCRYPTION_KEY_ENV_VAR,
)


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


def get_header_token(authorization: str):
    if not authorization:
        return False

    parts = authorization.split()

    if parts[0].lower() != "bearer":
        return False

    if len(parts) == 1:
        return False

    if len(parts) > 2:
        return False

    return parts[1]


def get_token_from_request(request):
    cookie_name = get_session_cookie_name()
    header = request.headers.get("Authorization", None)
    cookie = request.cookies.get(cookie_name, None)
    if header:
        return get_header_token(header)
    elif cookie:
        return cookie


def get_session_cookie_name():
    _SECURE_COOKIE: bool = bool(
        os.environ[key].lower() in ["true", "1"]
        if (key := "CAS_SECURE_COOKIE") in os.environ
        else True
    )

    COOKIE_NAME = (
        "__Secure-next-auth.session-token"
        if _SECURE_COOKIE
        else "next-auth.session-token"
    )

    return COOKIE_NAME
