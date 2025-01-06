"""
FiftyOne secrets provider interface

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from ..secret import ISecret
from typing import Dict, List, Optional


class ISecretProvider(abc.ABC):
    @abc.abstractmethod
    async def get(self, key: str, **kwargs) -> Optional[ISecret]:
        """
        Get a secret by key.
        """
        ...

    @abc.abstractmethod
    def get_sync(self, key: str, **kwargs) -> Optional[ISecret]:
        """
        Get a secret by key in a synchronous context.
        """
        ...

    @abc.abstractmethod
    async def get_multiple(
        self, keys: List[str], **kwargs
    ) -> Dict[str, Optional[ISecret]]:
        """
        Get multiple secrets by key.
        """
        ...

    @abc.abstractmethod
    async def search(
        self, regex: str, **kwargs
    ) -> Dict[str, Optional[ISecret]]:
        """
        Get secrets with keys matching regex
        """
        ...
