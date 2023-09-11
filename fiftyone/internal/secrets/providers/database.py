"""
FiftyOne database secrets provider.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.internal.crypto import decrypt_token
from fiftyone.internal.util import has_encryption_key

from fiftyone.internal.secrets.graphql import (
    resolve_secrets,
    resolve_secret,
)
from fiftyone.internal.secrets.secret import (
    UnencryptedSecret,
    ISecret,
    EncryptedSecret,
)
from fiftyone.internal.secrets.providers.iprovider import ISecretProvider
from typing import Dict, List, Optional


class FiftyoneDatabaseSecretProvider(ISecretProvider):
    """Secrets service client that uses the FiftyOne database as the secret
    store"""

    def __init__(
        self,
        encryption_key: str,
        **kwargs,
    ):
        if not has_encryption_key():
            raise Exception(
                f"Failed to initialize {self.__class__.__name__}. "
                f"Missing s"
                f"encryption key and/or internal service token."
            )
        self.__encryption_key = encryption_key

    async def get(self, key: str, **kwargs) -> Optional[ISecret]:
        secret = None
        if "request_token" in kwargs.keys():
            request_token = kwargs["request_token"]
            _gql_encrypted_secret = await resolve_secret(
                key, request_token=request_token
            )
            if _gql_encrypted_secret:
                secret = self._decrypt_if_possible(_gql_encrypted_secret)
        return secret

    async def get_multiple(
        self, keys: List[str], **kwargs
    ) -> Dict[str, Optional[ISecret]]:
        if "request_token" in kwargs.keys():
            request_token = kwargs["request_token"]
            _gql_encrypted_secrets = await resolve_secrets(
                keys, request_token=request_token
            )
            if _gql_encrypted_secrets:
                return {
                    secret.key: self._decrypt_if_possible(secret)
                    for secret in _gql_encrypted_secrets
                }
        return {}

    def _decrypt_if_possible(
        self, encrypted_secret: ISecret
    ) -> Optional[ISecret]:
        """
        Decrypts the secret if possible, otherwise returns the encrypted secret
        """
        try:
            decrypted_value = decrypt_token(
                encrypted_secret.value,
                encryption_key=self.__encryption_key,
            )
            secret = UnencryptedSecret(
                key=encrypted_secret.key, value=decrypted_value
            )
        except:
            secret = EncryptedSecret(
                key=encrypted_secret.key, value=encrypted_secret.value
            )

        return secret
