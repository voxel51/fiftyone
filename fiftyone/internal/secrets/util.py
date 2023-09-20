"""
Fiftyone secret utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import re
from typing import Union

from .secret import ISecret, UnencryptedSecret


def normalize_secret_key(key: str):
    """Normalizes a key to be all uppercase snake case.

    Args:
        key: a key

    Returns:
        the normalized key
    """

    return "_".join(re.findall(r"\w+", key)).upper()


def ensure_unencrypted_secret(
    secret: Union[ISecret, None]
) -> UnencryptedSecret:
    """Returns a secret if and only if it has a plaintext value.
    Otherwise, raises an exception."""

    if (
        secret
        and not getattr(secret, "is_encrypted", False)
        and getattr(secret, "value", None)
    ):
        return UnencryptedSecret(key=secret.key, value=secret.value)

    raise Exception(f"Secret {secret} is not an unencrypted secret.")
