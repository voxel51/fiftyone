"""
FiftyOne secrets provider interface

| Copyright 2017-2023, Voxel51, Inc.
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

    async def get_multiple(
        self, keys: List[str], **kwargs
    ) -> Dict[str, Optional[ISecret]]:
        """
        Get multiple secrets by key.
        """
        ...
