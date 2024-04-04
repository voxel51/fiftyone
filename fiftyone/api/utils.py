"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
import codecs
import inspect
import pickle
from typing import (
    Any,
    Iterable,
    Iterator,
    Mapping,
    Optional,
    Union,
    Tuple,
    Type,
)

import dill


def marshall(value: Any) -> str:
    """Marshall any Python objects into string."""
    try:
        pickled = pickle.dumps(value)
    except Exception:  # pylint: disable=broad-except
        pickled = dill.dumps(value)
    return codecs.encode(pickled, "base64").decode()


def unmarshall(value: Union[bytes, str]) -> Any:
    """Unmarshall any Python objects from string."""
    if not value:
        return

    if isinstance(value, str):
        value = value.encode()

    decoded = codecs.decode(value, "base64")

    try:
        unpickled = pickle.loads(decoded)
    except Exception:  # pylint: disable=broad-except
        unpickled = dill.loads(decoded)

    return unpickled


class IProxy(abc.ABC):
    """Interface for createing a proxy for arbitrary Python classes"""

    __proxy_class__: Type[Any]

    @property
    def __class__(self):
        return self.__proxy_class__

    @abc.abstractmethod
    def __proxy_it__(
        self,
        name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
    ):
        """Proxy attribute retrieval or function execution."""


class ProxyMeta(abc.ABCMeta):
    """Metaclass for wrapping public methods with proxy"""

    def __new__(mcs, name: Any, bases: Any, namespace: Any, **kwargs: Any):
        # Create new class.
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)

        if not issubclass(cls, IProxy):
            # Does not implement IProxy.
            raise TypeError("Must be a subclass of IProxy.")

        try:
            assert cls.__proxy_class__
        except (AssertionError, AttributeError) as err:
            ...
        else:  # Concrete implementation of IProxy.
            for name, wrapped in cls._wrap_members():
                setattr(cls, name, wrapped)

        return cls

    def _wrap_member(cls, name: str, member: Any, *_, **__) -> Any:
        if inspect.isfunction(member):

            def inner(instance, *args, **kwargs):
                return instance.__proxy_it__(name, args, kwargs)

            return inner
        else:

            def inner(instance):
                return instance.__proxy_it__(name)

            return inner

    def _wrap_members(cls) -> Iterator[Tuple[str, Any]]:
        implemented = {
            n for n, _ in inspect.getmembers(cls) if not n.startswith("_")
        }

        for name, member in inspect.getmembers(cls.__proxy_class__):
            if name.startswith("_") or name in implemented:
                continue

            # pylint: disable-next=no-value-for-parameter
            yield name, cls._wrap_member(name, member)
