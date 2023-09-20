"""
FiftyOne Teams secret encryption/decryption handlers.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
import os
from typing import Optional, Protocol, Union

import fiftyone.internal.crypto as crypto
from fiftyone.internal.constants import ENCRYPTION_KEY_ENV_VAR


class IEncryptionHandler(Protocol):
    @abc.abstractmethod
    def encrypt(self, plaintext: str) -> Union[bytes, str]:
        """
        Encrypts the given plaintext string.
        """
        ...

    @abc.abstractmethod
    def decrypt(self, ciphertext: Union[bytes, str]) -> str:
        """
        Decrypts the given ciphertext string.
        """
        ...


class FernetEncryptionHandler(IEncryptionHandler, abc.ABC):
    """Wrapper for Symmetric encryption using Fernet."""

    def __init__(self, key: str, ttl: Optional[int] = None):
        """
        Args:
            key: the encryption key
            ttl: the time-to-live of the encrypted token, in seconds
        """
        self._key = key
        self._ttl = ttl

    @property
    def ttl(self) -> Optional[int]:
        return self._ttl or None

    @abc.abstractmethod
    def encrypt(self, plaintext: str) -> Union[bytes, str]:
        """
        Encrypts the given plaintext string.
        """
        return crypto.encrypt_string(plaintext, self._key)

    @abc.abstractmethod
    def decrypt(self, ciphertext: Union[bytes, str]) -> str:
        """
        Decrypts the given ciphertext string.
        """

        return crypto.decrypt_token(
            token=ciphertext, encryption_key=self._key, ttl=self._ttl
        )


class FiftyoneDBEncryptionHandler(FernetEncryptionHandler):
    """Symmetric encryption using Fernet."""

    def __init__(self, key: Optional[str] = None, ttl: Optional[int] = None):
        if not key:
            key = os.getenv(ENCRYPTION_KEY_ENV_VAR)
        if not key:
            raise ValueError("Encryption key is required")

        super().__init__(key, ttl)

    def encrypt(self, plaintext: str) -> Union[bytes, str]:
        return super().encrypt(plaintext)

    def decrypt(
        self,
        ciphertext: Union[bytes, str],
    ) -> str:
        return super().decrypt(ciphertext)
