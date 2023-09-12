"""
FiftyOne Teams secrets manager.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import traceback
from typing import Dict, List, Optional, Union

from . import ISecretProvider
from .util import ensure_unencrypted_secret
from fiftyone.internal.constants import (
    ENCRYPTION_KEY_ENV_VAR,
)

from fiftyone.internal.secrets.encryption import (
    FiftyoneDBEncryptionHandler,
    IEncryptionHandler,
)
import fiftyone.internal.secrets as fois
from ..util import has_encryption_key


# TODO: expose a way to add external secret providers via config file,
#  plugins, etc.
class SecretsManager(ISecretProvider):
    """
    Manages secrets and their usage in FiftyOne Teams.
    Retrieves secrets from the local environment and the Fiftyone database
    by default.
    """

    def __init__(
        self,
        external_secret_providers: Optional[
            Union[List[fois.ISecretProvider], fois.ISecretProvider]
        ] = None,
        crypto: Optional[IEncryptionHandler] = None,
        **kwargs,
    ):
        """

        Args:
            external_secret_providers: a list of additional external secret
            providers from which to retrieve secrets.
            crypto: an encryption handler to use for encrypting and
            decrypting secrets while in transit.
            **kwargs:
        """

        self._encryption_key = os.getenv(ENCRYPTION_KEY_ENV_VAR)
        self._crypto = crypto
        self._providers = [fois.EnvSecretProvider()]
        if has_encryption_key():
            # only add the database secret provider if running as an
            # internal service with an encryption key
            self._providers.append(
                fois.FiftyoneDatabaseSecretProvider(
                    encryption_key=self._encryption_key,
                )
            )
            if self._crypto is None:
                self._crypto = FiftyoneDBEncryptionHandler(
                    self._encryption_key,
                )
        else:
            logging.info(
                "SecretsManager can only access secrets from the database "
                "when initialized from within an environment with set "
                "internal service ID and encryption key. "
            )

        if external_secret_providers:
            self._providers += list(external_secret_providers)

    def _decrypt(self, token: Union[str, bytes], **kwargs) -> Optional[str]:
        try:
            decrypted = self._crypto.decrypt(token)
        except Exception as e:
            print(traceback.format_exc())
            raise (e)
        return decrypted

    def _encrypt(self, data: Union[str, bytes], **kwargs) -> Optional[bytes]:
        try:
            encrypted = self._crypto.encrypt(data)
        except Exception as e:
            print(traceback.format_exc())
            raise (e)
        return encrypted

    async def _get_secret_from_providers(
        self, key: str, **kwargs
    ) -> Optional[fois.UnencryptedSecret]:
        """Get a secret from the provider."""
        for provider in self._providers:
            try:
                secret = await provider.get(key, **kwargs)
            except Exception as e:
                print(
                    f"Failed to get secret for key {key} with provider"
                    f" {provider}"
                )
                print(traceback.format_exc())
                continue
            if secret:
                try:
                    return ensure_unencrypted_secret(secret)
                except Exception as e:
                    print(
                        f"Failed to decrypt secret for key {key} with "
                        f"provider"
                        f" {provider}"
                    )
                    print(traceback.format_exc())
                    continue
        return None

    async def _get_secrets_from_providers(
        self, keys: List[str], **kwargs
    ) -> Dict[str, Optional[fois.UnencryptedSecret]]:
        """Get secrets from the provider."""
        secrets = {}
        keys = set(keys)

        for provider in self._providers:
            _keys = keys - set(secrets.keys())
            _secrets = await provider.get_multiple(_keys, **kwargs)
            for k, secret in _secrets.items():
                try:
                    secrets[k] = ensure_unencrypted_secret(secret)
                except Exception as e:
                    print("Failed to get secret for key", k)
                    print(traceback.format_exc())
                    secrets.pop(k, None)

        return secrets

    async def get(
        self, key: str, **kwargs
    ) -> Optional[fois.UnencryptedSecret]:
        """Get a secret with plaintext value for the given key. Local
        environment variables will take priority if they exist."""
        return await self._get_secret_from_providers(key, **kwargs)

    async def get_multiple(
        self, keys: List[str], **kwargs
    ) -> Dict[str, Optional[fois.UnencryptedSecret]]:
        """Get secrets with plaintext values from providers for the given
        keys. Local environment variables will take priority if they exist."""
        return await self._get_secrets_from_providers(keys, **kwargs)
