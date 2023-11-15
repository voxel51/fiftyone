"""
Plugin secrets resolver.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import typing
from typing import Optional
from ..internal import secrets as fois


class PluginSecretsResolver:
    """Injects secrets from environmental variables into the execution
    context."""

    _instance = None
    _registered_secrets = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PluginSecretsResolver, cls).__new__(cls)
            cls._instance.client = _get_secrets_client()
        return cls._instance

    def register_operator(
        self, operator_uri: str, required_secrets: typing.List[str]
    ) -> None:
        self._registered_secrets[operator_uri] = required_secrets

    def client(self) -> fois.ISecretProvider:
        if not self._instance:
            self._instance = self.__new__(self.__class__)
        return self._instance.client

    async def get_secret(
        self, key: str, operator_uri: str, **kwargs
    ) -> Optional[fois.ISecret]:
        """
        Get the value of a secret.

        Args:
            key (str): unique secret identifier
            kwargs: additional keyword arguments to pass to the secrets
            client for authentication if required
        """
        # pylint: disable=no-member

        secret_requirements = self._registered_secrets.get(operator_uri, None)

        if not secret_requirements:
            logging.error(
                f"Cannot resolve secrets for unregistered "
                f"operator`{operator_uri}` "
            )
            return None
        if key not in secret_requirements:
            logging.error(
                f"Cannot resolve secret {key} because it is not "
                f"included in the plugins definition "
            )
            return None
        resolved_secret = await self.client.get(key, **kwargs)
        return resolved_secret

    def get_secret_sync(
        self, key: str, operator_uri: str, **kwargs
    ) -> Optional[fois.ISecret]:
        """
        Get the value of a secret.

        Args:
            key (str): unique secret identifier
            kwargs: additional keyword arguments to pass to the secrets
            client for authentication if required
        """
        # pylint: disable=no-member

        secret_requirements = self._registered_secrets.get(operator_uri, None)
        if not secret_requirements:
            logging.error(
                f"Cannot resolve secrets for unregistered "
                f"operator`{operator_uri}` "
            )
            return None
        if key not in secret_requirements:
            logging.error(
                f"Cannot resolve secret {key} because it is not "
                f"included in the plugins definition "
            )
            return None
        return self.client.get_sync(key, **kwargs)


def _get_secrets_client():
    try:
        client = getattr(fois, "SecretsManager")
    except:  # pylint: disable=bare-except
        client = getattr(fois, "EnvSecretProvider")
    return client()


class SecretsDictionary:
    """
    A more secure dictionary for accessing plugin secrets in
    operators that will attempt to resolve missing plugin secrets upon access.
    """

    def __init__(self, secrets_dict, operator_uri=None, resolver_fn=None):
        self.__secrets = secrets_dict  # types.MappingProxyType(secrets_dict)
        self._operator_uri = operator_uri
        if resolver_fn:
            self._resolver = resolver_fn
        else:
            self._resolver = None

    def __eq__(self, other):
        return self.__secrets == other

    def __getitem__(self, key):
        # Override __getitem__ to suppress KeyError and attempt to resolve
        # plugin secrets if not yet resolved
        val = self.__secrets.get(key, None)
        if self._resolver and val is None:
            val = self._resolver(key=key, operator_uri=self._operator_uri)
            if val:
                self.__secrets[key] = val
        return val

    def __setitem__(self, key, value):
        raise RuntimeError("Setting values is not allowed")

    def __deepcopy__(self, memodict={}):
        logging.warning(
            "Copying the SecretDictionary values is not " "allowed."
        )

        return {k: None for k in self.__secrets.keys()}

    def __dict__(self):
        return {k: True for k, v in self.__secrets.items() if v is not None}

    def copy(self):
        logging.warning(
            "Copying the SecretDictionary values is not " "allowed."
        )
        return self.__deepcopy__()

    def keys(self):
        return [k for k, v in self.__secrets.items() if v is not None]

    def values(self):
        # Override values() to prevent iterating through plaintext values
        raise RuntimeError("Iteration through values is not allowed")

    def items(self):
        # Override items() to prevent iterating through plaintext values
        raise RuntimeError("Iteration through items is not allowed.")
