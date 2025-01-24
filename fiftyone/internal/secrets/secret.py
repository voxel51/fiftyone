"""
FiftyOne secret types

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from typing import Union


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
    def value(self) -> Union[str, int, bytes]:
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

    def __repr__(self):
        return (
            f"{self.__class__.__name__}(key={self.key}, value="
            f'{"*" * len(self.value)})'
        )

    def __str__(self):
        return (
            f"{self.__class__.__name__}(key={self.key},  has"
            f'_value={"True" if self.value else "False"})'
        )

    def __bool__(self) -> bool:
        return bool(self.value)

    def __eq__(self, other) -> bool:
        """Secrets are equal if their values are equal."""
        other_value = None
        if isinstance(other, (str, bytes)):
            other_value = str(other)
        if hasattr(other, "value") and isinstance(other.value, (str, bytes)):
            other_value = str(other.value)

        return str(self.value) == other_value if other_value else False

    @property
    @abc.abstractmethod
    def key(self) -> str:
        ...

    @property
    @abc.abstractmethod
    def value(self) -> Union[str, int, bytes]:
        ...

    @property
    @abc.abstractmethod
    def is_encrypted(self) -> bool:
        """
        Whether the secret is encrypted.
        """
        ...


class UnencryptedSecret(AbstractSecret):
    """
    FiftyOne secret with plaintext value.
    """

    def __init__(self, key: str, value: str):
        super().__init__(key, value)

    @property
    def key(self) -> str:
        return self._key

    @property
    def value(self) -> Union[str, int, bytes]:
        return self._value

    @property
    def is_encrypted(self) -> bool:
        return False
