from typing import Optional
from ..internal import secrets as fois


class PluginSecretsResolver:
    """Injects secrets from environmental variables into the plugin context."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            print("Creating PluginSecretsProvider instance")
            cls._instance = super(PluginSecretsResolver, cls).__new__(cls)
            cls._instance.client = _get_secrets_client()
        return cls._instance

    def get_secret(self, key) -> Optional[fois.ISecret]:
        return self._instance.client.get(key)


def _get_secrets_client():
    try:
        client = getattr(fois, "SecretsManager")
    except:  # pylint: disable=bare-except
        client = getattr(fois, "EnvSecretProvider")
    return client()
