"""
Plugin secrets resolver.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections.abc import Mapping
import logging
import traceback
import typing
from typing import Optional

from ..internal import secrets as fois


logger = logging.getLogger(__name__)


class PluginSecretsResolver(object):
    """Injects secrets into the execution context."""

    _instance = None
    _registered_secrets = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PluginSecretsResolver, cls).__new__(cls)
            cls._instance.client = _get_secrets_client()
        return cls._instance

    def register_operator(self, operator_uri, secrets):
        self._registered_secrets[operator_uri] = secrets

    def client(self):
        if not self._instance:
            self._instance = self.__new__(self.__class__)
        return self._instance.client

    async def get_secret(self, key, operator_uri, **kwargs):
        """Gets the value of a secret.

        Args:
            key: a secret key
            operator_uri: the operator URI
            **kwargs: additional keyword arguments to pass to the secrets
                client for authentication
        """
        secret_requirements = self._registered_secrets.get(operator_uri, None)

        if not secret_requirements:
            logger.error(
                f"Cannot resolve secret for unregistered "
                f"operator `{operator_uri}`"
            )
            return None

        if key not in secret_requirements:
            logger.error(
                f"Cannot resolve secret {key} because it is not "
                f"included in the plugin definition "
            )
            return None

        # pylint: disable=no-member
        return await self.client.get(key, **kwargs)

    def get_secret_sync(self, key, operator_uri, **kwargs):
        """Gets the value of a secret.

        Args:
            key: a secret key
            operator_uri: the operator URI
            **kwargs: additional keyword arguments to pass to the secrets
                client for authentication
        """
        secret_requirements = self._registered_secrets.get(operator_uri, None)

        if not secret_requirements:
            logger.error(
                f"Cannot resolve secret for unregistered "
                f"operator `{operator_uri}`"
            )
            return None

        if key not in secret_requirements:
            logger.error(
                f"Cannot resolve secret {key} because it is not "
                f"included in the plugins definition "
            )
            return None

        # pylint: disable=no-member
        return self.client.get_sync(key, **kwargs)


def _get_secrets_client():
    try:
        client = getattr(fois, "SecretsManager")
    except:  # pylint: disable=bare-except
        client = getattr(fois, "EnvSecretProvider")
    return client()


class SecretsDictionary(Mapping):
    """A read-only mapping between secret keys and values."""

    def __init__(self, secrets):
        self._secrets = secrets

    def __getitem__(self, key):
        return self._secrets.get(key, None)

    def __len__(self):
        return len(self._secrets)

    def __iter__(self):
        return iter(self._secrets)
