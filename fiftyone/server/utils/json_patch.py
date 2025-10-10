"""
Apply JSON patch to python objects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
import dataclasses
import enum
import functools
from typing import Any, ClassVar, Generic, Protocol, Type, TypeVar, Union

import jsonpointer


T = TypeVar("T")
K = TypeVar("K")
V = TypeVar("V")


class Object(Protocol[K, V]):
    """Protocol for any object supporting __delitem__, __getattr__, and
    __setattr__."""

    def __delattr__(self, name: K) -> None: ...
    def __getattr__(self, name: K) -> V: ...
    def __setattr__(self, name: K, value: V) -> None: ...


class Subscriptable(Protocol[K, V]):
    """Protocol for any object supporting __delitem__, __getitem__, and
    __setitem__."""

    def __delitem__(self, key: K) -> V: ...
    def __getitem__(self, key: K) -> V: ...
    def __setitem__(self, key: K, value: V) -> None: ...


class Operation(str, enum.Enum):
    """The type of JSON Patch operation."""

    ADD = "add"
    REMOVE = "remove"
    REPLACE = "replace"
    MOVE = "move"
    COPY = "copy"
    TEST = "test"


@functools.lru_cache
def _get_accessors(path: str) -> list[str]:
    """The list of accessors in the JSON pointer path."""
    return path.lstrip("/").split("/") if path != "/" else []


def _get(src: Union[Object[K, V], Subscriptable[K, V]], accessor: K) -> V:
    """Gets the value of the specified attribute, key, or index from the source
    object.

    Args:
        src (Union[Subscriptable, Object]): The source object.
        accessor (K): The attribute name, key, or index to access.
    Raises:
        ValueError: If src is a list and the accessor cannot be cast to an
          integer.
        IndexError: If src is a list and the index is out of range.
        KeyError: If the src is subscriptable and the specified key does not
          exist.
        AttributeError: If the src does not have the specified attribute.
    Returns:
        V: The value of the specified attribute, key, or index.
    """
    try:
        return getattr(src, accessor)
    except AttributeError as err:
        if not hasattr(src, "__getitem__"):
            raise err

        try:
            return src[accessor]
        except TypeError as type_err:
            if "list indices must be integers or slices" in str(type_err):
                try:
                    accessor = int(accessor)
                except ValueError as val_err:
                    raise val_err

                if not 0 <= accessor <= len(src):
                    raise IndexError("List index out of range") from err

                return src[accessor]

        except KeyError as key_err:
            raise key_err


def _add(
    src: Union[Object[K, V], Subscriptable[K, V]], accessor: K, value: V
) -> None:
    try:
        setattr(src, accessor, value)
    except AttributeError as err:
        if not hasattr(src, "__getitem__"):
            raise err

        try:
            src[accessor] = value
        except TypeError as type_err:
            if "list indices must be integers or slices" in str(type_err):
                if accessor == "-":
                    src.append(value)
                else:
                    accessor = int(accessor)

                    if not 0 <= accessor <= len(src):
                        raise IndexError("List index out of range") from err

                    src.insert(accessor, value)

                return

            raise type_err
        except KeyError as key_err:
            raise key_err


def _remove(
    src: Union[Object[K, V], Subscriptable[K, V]], accessor: K
) -> None:
    try:
        delattr(src, accessor)
    except AttributeError as err:
        if not hasattr(src, "__getitem__"):
            raise err

        try:
            del src[accessor]
        except TypeError as type_err:
            if "list indices must be integers or slices" in str(type_err):
                try:
                    accessor = int(accessor)
                except ValueError as val_err:
                    raise val_err

                if not 0 <= accessor < len(src):
                    raise IndexError("List index out of range") from type_err

                src.pop(int(accessor))

                return
            raise type_err
        except KeyError as key_err:
            raise key_err


@dataclasses.dataclass()
class Patch(Generic[T], abc.ABC):
    """A JSON Patch operation. See
    See https://datatracker.ietf.org/doc/html/rfc6902
    """

    op: ClassVar[Operation]
    path: str

    def __post_init__(self):
        try:
            jsonpointer.JsonPointer(self.path)  # Validate path
        except jsonpointer.JsonPointerException as err:
            raise ValueError(
                f"Invalid JSON pointer path: {self.path}"
            ) from err

    @abc.abstractmethod
    def apply(self, src: T) -> T:
        """Applies the patch operation an object.

        Args:
            src (T): The source object.

        Raises:
            AttributeError: If the path cannot be fully resolved.
            ValueError: If the patch operation fails.

        Returns:
            T: The patched source object.
        """


@dataclasses.dataclass()
class Add(Patch[T], Generic[T, V]):
    """Adds a value to a list field."""

    op: ClassVar[Operation] = Operation.ADD
    value: V

    def apply(self, src: T) -> Union[T, V]:
        accessors = _get_accessors(self.path)
        if not accessors:
            return self.value

        try:
            # get the parent location to add to
            parent = functools.reduce(_get, accessors[:-1], src)
        except Exception as err:
            raise AttributeError(f"Cannot resolve path: {self.path}") from err

        try:
            _add(parent, accessors[-1], self.value)
        except Exception as err:
            raise ValueError(
                f"Unable to add value with path: {self.path}"
            ) from err

        return src


@dataclasses.dataclass()
class Copy(Patch):
    """Copies a value from one path to another."""

    op: ClassVar[Operation] = Operation.COPY
    from_: str

    def apply(self, src: Union[object, dict, list], **_) -> None:
        try:
            value = functools.reduce(_get, _get_accessors(self.from_), src)
        except Exception as err:
            raise AttributeError(
                f"Cannot resolve 'from' path: {self.path}"
            ) from err

        accessors = _get_accessors(self.path)
        try:
            # get the parent location to remove from
            parent = functools.reduce(_get, accessors[:-1], src)
        except Exception as err:
            raise AttributeError(
                f"Cannot resolve 'to' path: {self.path}"
            ) from err

        try:
            _add(parent, accessors[-1], value)
        except Exception as err:
            raise ValueError(
                f"Unable to move value with path: {self.path}"
            ) from err


@dataclasses.dataclass()
class Move(Patch):
    """Moves a value from one path to another."""

    op: ClassVar[Operation] = Operation.MOVE
    from_: str

    def apply(self, src: Union[object, dict, list], **_) -> Any:
        from_accessors = _get_accessors(self.from_)
        try:
            # get the parent location to remove from
            from_parent = functools.reduce(_get, from_accessors[:-1], src)
            # ensure the location exists
            value = _get(from_parent, from_accessors[-1])
        except Exception as err:
            raise AttributeError(
                f"Cannot resolve 'from' path: {self.path}"
            ) from err

        to_accessors = _get_accessors(self.path)
        try:
            # get the parent location to remove from
            to_parent = functools.reduce(_get, to_accessors[:-1], src)
        except Exception as err:
            raise AttributeError(
                f"Cannot resolve 'to' path: {self.path}"
            ) from err

        try:
            _remove(from_parent, from_accessors[-1])
            _add(to_parent, to_accessors[-1], value)
        except Exception as err:
            raise ValueError(
                f"Unable to move value with path: {self.path}"
            ) from err

        return src


@dataclasses.dataclass()
class Remove(Patch):
    """Removes a value from a list field."""

    op: ClassVar[Operation] = Operation.REMOVE

    def apply(self, src: Union[object, dict, list], **_) -> Any:
        accessors = _get_accessors(self.path)

        if not accessors:
            raise ValueError("Cannot remove the root document")

        try:
            # get the parent location to remove from
            parent = functools.reduce(_get, accessors[:-1], src)
            # ensure the location exists
            _get(parent, accessors[-1])
        except Exception as err:
            raise AttributeError(f"Cannot resolve path: {self.path}") from err

        try:
            _remove(parent, accessors[-1])
        except Exception as err:
            raise ValueError(
                f"Unable to remove value with path: {self.path}"
            ) from err

        return src


@dataclasses.dataclass()
class Replace(Patch, Generic[T]):
    """Replaces a value at a given path."""

    op: ClassVar[Operation] = Operation.REPLACE
    value: T

    def apply(self, src: Union[object, dict, list]) -> None:
        accessors = _get_accessors(self.path)

        try:
            # get the parent location to remove from
            parent = functools.reduce(_get, accessors[:-1], src)
            # ensure the location exists
            _get(parent, accessors[-1])
        except Exception as err:
            raise AttributeError(f"Cannot resolve path: {self.path}") from err

        try:
            _remove(parent, accessors[-1])
            _add(parent, accessors[-1], self.value)
        except Exception as err:
            raise ValueError(
                f"Unable to replace value with path: {self.path}"
            ) from err

        return src


@dataclasses.dataclass()
class Test(Patch, Generic[T]):
    """Tests that a value at a given path matches the provided value."""

    op: ClassVar[Operation] = Operation.TEST
    value: T

    def apply(self, src: Union[object, dict, list]) -> None:
        accessors = _get_accessors(self.path)

        try:
            # get the parent location to remove from
            parent = functools.reduce(_get, accessors[:-1], src)
            # ensure the location exists
            target = _get(parent, accessors[-1])
        except Exception as err:
            raise AttributeError(f"Cannot resolve path: {self.path}") from err

        if target != self.value:
            raise ValueError(f"Test operation failed for path:{self.path}")

        return src


def parse(*patches: dict[str, Any]) -> Union[Patch, list[Patch]]:
    """Parses the provided JSON patch dicts into Patch objects.

    Raises:
        ValueError: Any of the patches are invalid.

    Returns:
        Union[Patch, list[Patch]]: A single Patch if one patch dict was
          provided, otherwise a list of Patch objects.
    """

    parsed = []
    for patch in patches:
        # Convert to object
        patch_cls: Type[Patch]
        kwargs = {"path": patch["path"]}

        op = Operation(patch["op"])
        if op == Operation.ADD:
            patch_cls = Add
            kwargs.update(value=patch["value"])
        elif op == Operation.REMOVE:
            patch_cls = Remove
        elif op == Operation.REPLACE:
            patch_cls = Replace
            kwargs.update(value=patch["value"])
        elif op == Operation.COPY:
            patch_cls = Copy
            kwargs.update(from_=patch["from"])
        elif op == Operation.MOVE:
            patch_cls = Move
            kwargs.update(from_=patch["from"])
        elif op == Operation.TEST:
            patch_cls = Test
            kwargs.update(value=patch["value"])
        else:
            raise ValueError(f"Unsupported operation '{op}'")

        try:
            parsed.append(patch_cls(**kwargs))
        except Exception as err:
            raise ValueError(f"Invalid operation '{op}'") from err

    return parsed if len(parsed) > 1 else parsed[0]
