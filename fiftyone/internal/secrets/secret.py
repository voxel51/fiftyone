"""
FiftyOne secret types.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from abc import ABC
from datetime import datetime, timedelta
from typing import Optional, Union

from fiftyone.internal.secrets.encryption import (
    FiftyoneDBEncryptionHandler,
    IEncryptionHandler,
)


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
    Fiftyone secret with plaintext value.
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


# fiftyone-teams only
class EncryptedSecret(AbstractSecret, ABC):
    """
    Enable sharing secrets between Fiftyone internal services. Instances
    only store the value in its encrypted state to prevent revealing in
    print statements, tracebacks etc.
    Can only be decrypted by services internal to Fiftyone and should only
    be decrypted at the point it is required.
    """

    def __init__(
        self,
        key: str,
        value: Union[str, bytes],
        crypto: Optional[IEncryptionHandler] = None,
        **kwargs,
    ):
        super().__init__(key, value)
        self._token_created_at = datetime.now()
        self._hash = hash(str(self._value))
        self._id = kwargs.get("id", None)
        for k, v in kwargs.items():
            setattr(self, k, v)
        self._crypto = crypto or FiftyoneDBEncryptionHandler()

    @property
    def key(self) -> str:
        return self._key

    @property
    def value(self) -> Union[str, int, bytes]:
        return self._value

    @property
    def is_encrypted(self) -> bool:
        return True

    @property
    def expire_time(self) -> Optional[datetime]:
        if self._crypto.ttl is None:
            return None
        return self._token_created_at + timedelta(seconds=self._crypto.ttl)

    @classmethod
    def from_dict(self, data: dict, include: Optional[list] = None):
        if include is None:
            include = ["key", "value", "id", "_hash"]

        return EncryptedSecret(
            **{k: v for k, v in data.items() if k in include}
        )
