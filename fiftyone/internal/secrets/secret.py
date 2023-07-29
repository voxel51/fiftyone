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
    Secret interface.
    """

    @property
    @abc.abstractmethod
    def key(self) -> str:
        """
        The secret's string identifier.
        """
        pass

    @property
    @abc.abstractmethod
    def value(self) -> str:
        """
        The secret's value.
        """
        pass


class AbstractSecret(ISecret, abc.ABC):
    """
    Abstract secret.
    """

    def __init__(self, key: str, value: str):
        self._key = key
        self._value = value
        self._created_at = datetime.now()

    def __repr__(self):
        return (
            f"{self.__class__.__name__}(_key={self.key}, "
            f'_value={"*" * len(self._value)}, '
            f"_created_at={self._created_at})"
        )

    def __str__(self):
        return (
            f"{self.__class__.__name__}(key={self.key},  "
            f'has_value={"True" if self._value else "False"})'
        )

    @property
    @abc.abstractmethod
    def key(self) -> str:
        return self._key

    @property
    @abc.abstractmethod
    def value(self) -> str:
        return self._value


class EnvSecret(AbstractSecret):
    """
    Fiftyone secret.
    """

    def __init__(self, key: str, value: str):
        super().__init__(key, value)

    @property
    def key(self) -> str:
        return super().key

    @property
    def value(self) -> str:
        return super().value
