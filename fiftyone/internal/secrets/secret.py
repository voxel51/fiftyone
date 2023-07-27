"""
FiftyOne secret types

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from datetime import datetime


class ISecret(abc.ABC):
    """
    Interface for a secret.
    """

    @abc.abstractmethod
    def key(self) -> str:
        """
        The secret's string identifier.
        """
        pass

    @abc.abstractmethod
    def value(self) -> str:
        """
        The secret's value.
        """
        pass


class EnvSecret(ISecret, abc.ABC):
    """
    Fiftyone secret.
    """

    def __init__(self, key: str, value: str):
        self._key = key
        self._value = value
        self._created_at = datetime.now()

    def key(self) -> str:
        return self._key

    def value(self) -> str:
        return self._value
