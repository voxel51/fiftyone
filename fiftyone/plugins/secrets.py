from typing import Optional
import fiftyone.internal.secrets as fois
from fiftyone.internal.secrets import ISecretProvider


class PluginSecretsResolver:
    """Injects secrets from environmental variables into the plugin context."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            print("Creating PluginSecretsProvider instance")
            cls._instance = super(PluginSecretsResolver, cls).__new__(cls)
            cls._instance.client = _get_secrets_client()
        return cls._instance

    def client(self) -> ISecretProvider:
        if not self._instance:
            self._instance = self.__new__(self.__class__)
        return self._instance.client

    async def get_secret(self, key, auth_token=None) -> Optional[fois.ISecret]:
        # pylint: disable=no-member
        resolved_secret = await self.client.get(key, auth_token=auth_token)
        return resolved_secret


def _get_secrets_client():
    try:
        client = getattr(fois, "SecretsManager")
    except:  # pylint: disable=bare-except
        client = getattr(fois, "EnvSecretProvider")
    return client()
