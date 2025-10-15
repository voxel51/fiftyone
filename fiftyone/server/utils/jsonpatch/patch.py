"""
Apply JSON patch to python objects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
import enum
import inspect
from typing import Any, Generic, TypeVar, Union


from fiftyone.server.utils.jsonpatch import methods

T = TypeVar("T")
V = TypeVar("V")


class Operation(str, enum.Enum):
    """The type of JSON Patch operation."""

    ADD = "add"
    REMOVE = "remove"
    REPLACE = "replace"
    MOVE = "move"
    COPY = "copy"
    TEST = "test"


class Patch(abc.ABC):
    """A JSON Patch operation.

    See: https://datatracker.ietf.org/doc/html/rfc6902
    """

    op: Operation

    def __init_subclass__(cls):
        if not inspect.isabstract(cls) and not isinstance(
            getattr(cls, "op", None), Operation
        ):
            raise TypeError("Subclass must define 'op' class variable")

    def __init__(self, path: str):
        self._pointer = methods.to_json_pointer(path)

    @property
    def path(self) -> str:
        """The JSON pointer path of the patch operation."""
        return self._pointer.path

    @abc.abstractmethod
    def apply(self, src: Any) -> Any:
        """Applies the patch operation an object.

        Args:
            src (T): The source object.

        Raises:
            AttributeError: If the path cannot be fully resolved.
            ValueError: If the patch operation fails.

        Returns:
            T: The patched source object.
        """


class PatchWithValue(Patch, Generic[T], abc.ABC):
    """A JSON Patch operation that requires a value."""

    def __init__(self, path: str, value: T):
        super().__init__(path)
        self.value = value


class PatchWithFrom(Patch, abc.ABC):
    """A JSON Patch operation that requires a from path."""

    def __init__(self, path: str, from_: str):
        super().__init__(path)
        self._from_pointer = methods.to_json_pointer(from_)

    @property
    def from_(self) -> str:
        """The JSON pointer 'from' path of the patch operation."""
        return self._from_pointer.path


class Add(PatchWithValue):
    """Helper class for JSON Patch "add" operation."""

    op = Operation.ADD

    def apply(self, src: T) -> Union[T, V]:
        return methods.add(src, self._pointer, self.value)


class Copy(PatchWithFrom):
    """Helper class for JSON Patch "copy" operation."""

    op = Operation.COPY

    def apply(self, src: T) -> T:
        return methods.copy(src, self._pointer, self._from_pointer)


class Move(PatchWithFrom):
    """Helper class for JSON Patch "move" operation."""

    op = Operation.MOVE

    def apply(self, src: T) -> T:
        return methods.move(src, self._pointer, self._from_pointer)


class Remove(Patch):
    """Helper class for JSON Patch "remove" operation."""

    op = Operation.REMOVE

    def apply(self, src: T) -> T:
        return methods.remove(src, self._pointer)


class Replace(PatchWithValue):
    """Helper class for JSON Patch "replace" operation."""

    op = Operation.REPLACE

    def apply(self, src: T) -> T:
        return methods.replace(src, self._pointer, self.value)


class Test(PatchWithValue):
    """Helper class for JSON Patch "test" operation."""

    op = Operation.TEST

    def apply(self, src: T) -> T:
        return methods.test(src, self._pointer, self.value)
