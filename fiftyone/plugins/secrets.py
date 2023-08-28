"""
Plugin secrets resolver.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional
from ..internal import secrets as fois


class PluginSecretsResolver:
    """Injects secrets from environmental variables into the plugin context."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PluginSecretsResolver, cls).__new__(cls)
            cls._instance.client = _get_secrets_client()
        return cls._instance

    def client(self) -> fois.ISecretProvider:
        if not self._instance:
            self._instance = self.__new__(self.__class__)
        return self._instance.client

    async def get_secret(self, key, **kwargs) -> Optional[fois.ISecret]:
        """
        Get the value of a secret.

        Args:
            key (str): unique secret identifier
            kwargs: additional keyword arguments to pass to the secrets
            client for authentication if required
        """
        # pylint: disable=no-member
        resolved_secret = await self.client.get(key, **kwargs)
        return resolved_secret


def _get_secrets_client():
    try:
        client = getattr(fois, "SecretsManager")
    except:  # pylint: disable=bare-except
        client = getattr(fois, "EnvSecretProvider")
    return client()
