"""
FiftyOne Teams internal module for encrypting and decrypting strings.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional, Union

from cryptography.fernet import Fernet


def encrypt_string(plaintext: str, encryption_key: Union[bytes, str]):
    """Encrypts the given string using the given encryption_key.

    Args:
        plaintext: a string
        encryption_key: A URL-safe base64-encoded 32-byte or str key
        ttl: number of seconds old a message may be for it to be valid

    Returns:
        an encrypted string (AKA Fernet token")
    """
    fernet = Fernet(encryption_key)
    return fernet.encrypt(plaintext.encode())


def decrypt_token(
    token: Union[str, bytes],
    encryption_key: Union[bytes, str],
    ttl: Optional[int] = None,
):
    """Decrypts the Fernet token using the given encryption_key.
    Raises InvalidToken error if the encryption key is invalid or the token
    is older than ttl seconds.

    Args:
        token: data encrypted using Fernet
        encryption_key: A URL-safe base64-encoded 32-byte or str key
        ttl: number of seconds old a message may be for it to be valid

    Returns:
        a decrypted string
    """
    fernet = Fernet(encryption_key)
    if ttl is None:
        decrypted = fernet.decrypt(token).decode()
    else:
        decrypted = fernet.decrypt(token, ttl=ttl).decode()
    return decrypted
