"""
FiftyOne internal utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import re

import fiftyone as fo
import fiftyone.core.config as foc
from fiftyone.internal.constants import API_URL_ENV_VAR, ENCRYPTION_KEY_ENV_VAR


def is_internal_service():
    """Whether the SDK is running in an internal service context.

    Returns:
        True/False
    """
    val = os.environ.get("FIFTYONE_INTERNAL_SERVICE", "")
    return val.lower() in ("true", "1")


def is_remote_service():
    """Whether the SDK is running in a remote service context.

    Returns:
        True/False
    """
    return (
        has_encryption_key()
        or (fo.config.api_uri or os.getenv(API_URL_ENV_VAR))
        or not (
            fo.config.database_uri is None
            or re.match(
                r"^mongodb://.*(localhost|127.0.0.1|0.0.0.0)",
                fo.config.database_uri,
            )
        )
    )


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
    secure_cookie_env_name = "CAS_SECURE_COOKIE"
    _SECURE_COOKIE: bool = bool(
        os.environ[secure_cookie_env_name].lower() in ["true", "1"]
        if secure_cookie_env_name in os.environ
        else True
    )

    COOKIE_NAME = (
        "__Secure-next-auth.session-token"
        if _SECURE_COOKIE
        else "next-auth.session-token"
    )
    return COOKIE_NAME


def has_api_key():
    config = foc.load_config()
    return config.api_key is not None


def access_nested_element(root, nested_attrs):
    node = root
    # Traverse nested attributes if any, get()ing or getattr()ing along the way.
    for attr in nested_attrs:
        if node is None:
            break
        elif isinstance(node, dict):
            node = node.get(attr, None)
        else:
            node = getattr(node, attr, None)
    return node
