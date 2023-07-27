"""
FiftyOne secrets providers

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
import os
from typing import Optional

from .secret import EnvSecret, ISecret


class ISecretProvider(abc.ABC):
    @abc.abstractmethod
    def get(self, key: str) -> Optional[ISecret]:
        """
        Get a secret by key.
        """
        pass


class EnvSecretProvider:
    """
    Exposes secrets from environment variables.
    """

    def get(self, key) -> Optional[ISecret]:
        return EnvSecret(key, os.environ.get(key, None))
