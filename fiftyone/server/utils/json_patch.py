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
from typing import (
    Any,
    Callable,
    ClassVar,
    Generic,
    Optional,
    Protocol,
    TypeVar,
    Union,
)

import jsonpointer


T = TypeVar("T")
K = TypeVar("K")
V = TypeVar("V")


class Object(Protocol[K, V]):
    """Protocol for any object supporting __delitem__, __getattr__, and
    __setattr__."""

    def __delattr__(self, name: K) -> None:
        ...

    def __getattr__(self, name: K) -> V:
        ...

    def __setattr__(self, name: K, value: V) -> None:
        ...


class Subscriptable(Protocol[K, V]):
    """Protocol for any object supporting __delitem__, __getitem__, and
    __setitem__."""

    def __delitem__(self, key: K) -> V:
        ...

    def __getitem__(self, key: K) -> V:
        ...

    def __setitem__(self, key: K, value: V) -> None:
        ...


class Operation(str, enum.Enum):
    """The type of JSON Patch operation."""

    ADD = "add"
    REMOVE = "remove"
    REPLACE = "replace"
    MOVE = "move"
    COPY = "copy"
    TEST = "test"


def delvalue(
    src: Union[Object[K, V], Subscriptable[K, V]], accessor: K
) -> None:
    """Deletes a value from an object.

    Args:
        src (Union[Object[K, V], Subscriptable[K, V]]): The source object.
        accessor (K): The attribute name, key, or index to remove.

    Raises:
        AttributeError: If the object does not have the property and is not
          subscriptable.
        KeyError: If the object is subscriptable and the key does not exist.
        ValueError: If the object is a list and the index is not an integer.
        IndexError: If the object is a list and the index is out of bound.
    """

    if hasattr(src, "__getitem__"):
        try:
            del src[accessor]
            return
        except Exception as err:
            if isinstance(err, TypeError):
                if "list indices must be integers or slices" in str(err):
                    try:
                        accessor = int(accessor)
                    except ValueError as val_err:
                        raise val_err

                    if not 0 <= accessor < len(src):
                        raise IndexError("List index out of range") from err

                    src.pop(int(accessor))

                    return

            if isinstance(err, KeyError):
                raise err

    try:
        delattr(src, accessor)
    except AttributeError as err:
        raise err


def getvalue(src: Union[Object[K, V], Subscriptable[K, V]], accessor: K) -> V:
    """Gets a value from an object.

    Args:
        src (Union[Object[K, V], Subscriptable[K, V]]): The source object.
        accessor (K): The attribute name, key, or index to set.
    Raises:
        AttributeError: If the object does not have the attribute and is not
          subscriptable.
        KeyError: If the object is subscriptable and the key does not exist.
        ValueError: If the object is a list and the index is not an integer.
        IndexError: If the object is a list and the index is out of bounds.
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


def setvalue(
    src: Union[Object[K, V], Subscriptable[K, V]], accessor: K, value: V
) -> None:
    """Sets a value from an object.

    Args:
        src (Union[Object[K, V], Subscriptable[K, V]]): The source object.
        accessor (K): The attribute name, key, or index to set.
        value (V): The value to set.
    Raises:
        AttributeError: If the object cannot set the attribute and is not
          subscriptable.
        ValueError: If the object is a list and the index is not an integer.
        IndexError: If the object is a list and the index is out of bounds.
    """
    if hasattr(src, "__getitem__"):
        try:
            src[accessor] = value
            return
        except TypeError as type_err:
            if "list indices must be integers or slices" in str(type_err):
                # TODO: move to add as it's special to JSON patch and convert
                # to len(src)
                if accessor == "-":
                    src.append(value)
                else:
                    try:
                        accessor = int(accessor)
                    except ValueError as val_err:
                        raise val_err

                    if not 0 <= accessor <= len(src):
                        raise IndexError(
                            "List index out of range"
                        ) from type_err

                    src.insert(accessor, value)

                return

            raise type_err

    try:
        setattr(src, accessor, value)
    except AttributeError as err:
        raise err


@functools.lru_cache(maxsize=None)
def _get_path_parts(path: str) -> list[str]:
    return path.lstrip("/").split("/") if path != "/" else []


@dataclasses.dataclass
class Patch(abc.ABC):
    """A JSON Patch operation.

    See: https://datatracker.ietf.org/doc/html/rfc6902
    """

    op: ClassVar[Operation]
    path: str

    def __post_init__(self):
        try:
            jsonpointer.JsonPointer(self.path)
        except jsonpointer.JsonPointerException as err:
            raise ValueError(
                f"Invalid JSON pointer path: {self.path}"
            ) from err

    @property
    def path_parts(self) -> list[str]:
        """The parts of the JSON pointer path."""
        return _get_path_parts(self.path)

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


@dataclasses.dataclass
class _PatchWithValue(Patch, Generic[T], abc.ABC):
    value: T


@dataclasses.dataclass
class _PatchWithFrom(Patch, abc.ABC):
    from_: str

    @property
    def from_parts(self) -> list[str]:
        """The parts of the from JSON pointer path."""
        return _get_path_parts(self.path)

    def __post_init__(self):
        super().__post_init__()
        try:
            jsonpointer.JsonPointer(self.from_)
        except jsonpointer.JsonPointerException as err:
            raise ValueError(
                f"Invalid JSON pointer path: {self.from_}"
            ) from err


@dataclasses.dataclass
class Add(_PatchWithValue[V]):
    """The "add" operation performs one of the following functions,
     depending upon what the target location references:

     o  If the target location specifies an array index, a new value is
        inserted into the array at the specified index.
     o  If the target location specifies an object member that does not
        already exist, a new member is added to the object.
     o  If the target location specifies an object member that does exist,
        that member's value is replaced.

    The operation object MUST contain a "value" member whose content
    specifies the value to be added.

    When the operation is applied, the target location MUST reference one
    of:

    o  The root of the target document - whereupon the specified value
       becomes the entire content of the target document.

    o  A member to add to an existing object - whereupon the supplied
       value is added to that object at the indicated location.  If the
       member already exists, it is replaced by the specified value.

    o  An element to add to an existing array - whereupon the supplied
       value is added to the array at the indicated location.  Any
       elements at or above the specified index are shifted one position
       to the right.  The specified index MUST NOT be greater than the
       number of elements in the array.  If the "-" character is used to
       index the end of the array (see [RFC6901]), this has the effect of
       appending the value to the array.
    """

    op: ClassVar[Operation] = Operation.ADD
    value: V

    def apply(self, src: T) -> Union[T, V]:
        if self.path == "/":
            return self.value

        try:
            parent = functools.reduce(getvalue, self.path_parts[:-1], src)
        except Exception as err:
            raise AttributeError(f"Cannot resolve path: {self.path}") from err

        try:
            setvalue(parent, self.path_parts[-1], self.value)
        except Exception as err:
            raise ValueError(
                f"Unable to setvalue value with path: {self.path}"
            ) from err

        return src


@dataclasses.dataclass
class Copy(_PatchWithFrom):
    """The "copy" operation copies the value at a specified location to the
    target location.

    The operation object MUST contain a "from" member, which is a string
    containing a JSON Pointer value that references the location in the
    target document to copy the value from.

    The "from" location MUST exist for the operation to be successful.

    This operation is functionally identical to an "add" operation at the
    target location using the value specified in the "from" member.
    """

    op: ClassVar[Operation] = Operation.COPY

    def apply(self, src: T) -> T:
        if self.path == "/":
            raise ValueError("Cannot copy the root document")

        try:
            value = functools.reduce(getvalue, self.from_parts, src)
        except Exception as err:
            raise AttributeError(
                f"Cannot resolve 'from' path: {self.from_}"
            ) from err

        try:
            # get the parent location to remove from
            parent = functools.reduce(getvalue, self.path[:-1], src)
        except Exception as err:
            raise AttributeError(
                f"Cannot resolve 'to' path: {self.path}"
            ) from err

        try:
            setvalue(parent, self.path[-1], value)
        except Exception as err:
            raise ValueError(
                f"Unable to move value with path: {self.path}"
            ) from err


@dataclasses.dataclass
class Move(_PatchWithFrom):
    """The "move" operation removes the value at a specified location and
    adds it to the target location.

    The operation object MUST contain a "from" member, which is a string
    containing a JSON Pointer value that references the location in the
    target document to move the value from.

    The "from" location MUST exist for the operation to be successful.

    This operation is functionally identical to a "remove" operation on
    the "from" location, followed immediately by an "add" operation at
    the target location with the value that was just removed.

    """

    op: ClassVar[Operation] = Operation.MOVE

    def apply(self, src: T, **_) -> T:
        if self.path == "/":
            raise ValueError("Cannot move the root document")

        try:
            # get the parent location to remove from
            value_parent = functools.reduce(
                getvalue, self.from_parts[:-1], src
            )
            # ensure the location exists
            value = getvalue(value_parent, self.from_parts[-1])
            print(value)
        except Exception as err:
            raise AttributeError(
                f"Cannot resolve 'from' path: {self.path}"
            ) from err

        try:
            # get the parent location to remove from
            dest_parent = functools.reduce(getvalue, self.path_parts[:-1], src)
        except Exception as err:
            raise AttributeError(
                f"Cannot resolve 'to' path: {self.path}"
            ) from err

        try:
            delvalue(value_parent, self.from_parts[-1])
            try:
                setvalue(dest_parent, self.path_parts[-1], value)
            except Exception as err:
                # try to restore the original value if the setvalue fails
                setvalue(value_parent, self.from_parts[-1], value)
                raise err
        except Exception as err:
            raise ValueError(
                f"Unable to move value with path: {self.path}"
            ) from err

        return src


@dataclasses.dataclass
class Remove(Patch):
    """The "remove" operation removes the value at the target location.

    The target location MUST exist for the operation to be successful.

    If removing an element from an array, any elements above the
    specified index are shifted one position to the left.
    """

    op: ClassVar[Operation] = Operation.REMOVE

    def apply(self, src: Union[object, dict, list], **_) -> Any:
        if self.path == "/":
            raise ValueError("Cannot remove the root document")

        try:
            # get the parent location to remove from
            parent = functools.reduce(getvalue, self.path_parts[:-1], src)
            # ensure the location exists
            getvalue(parent, self.path_parts[-1])
        except Exception as err:
            raise AttributeError(f"Cannot resolve path: {self.path}") from err

        try:
            delvalue(parent, self.path_parts[-1])
        except Exception as err:
            raise ValueError(
                f"Unable to remove value with path: {self.path}"
            ) from err

        return src


@dataclasses.dataclass
class Replace(_PatchWithValue[V]):
    """The "replace" operation replaces the value at the target location
    with a new value.  The operation object MUST contain a "value" member
    whose content specifies the replacement value.

    The target location MUST exist for the operation to be successful.

    This operation is functionally identical to a "remove" operation for
    a value, followed immediately by an "add" operation at the same
    location with the replacement value.
    """

    op: ClassVar[Operation] = Operation.REPLACE
    value: V

    def apply(self, src: T) -> T:
        if self.path == "/":
            raise ValueError("Cannot remove the root document")

        try:
            # get the parent location to remove from
            parent = functools.reduce(getvalue, self.path_parts[:-1], src)
            # ensure the location exists
            value = getvalue(parent, self.path_parts[-1])
        except Exception as err:
            raise AttributeError(f"Cannot resolve path: {self.path}") from err

        try:
            delvalue(parent, self.path[-1])
            try:
                setvalue(parent, self.path[-1], self.value)
            except Exception as err:
                # try to restore the original value if the setvalue fails
                setvalue(parent, self.path[-1], value)
                raise err
        except Exception as err:
            raise ValueError(
                f"Unable to replace value with path: {self.path}"
            ) from err

        return src


@dataclasses.dataclass
class Test(_PatchWithValue[V]):
    """The "test" operation tests that a value at the target location is
    equal to a specified value.

    The operation object MUST contain a "value" member that conveys the
    value to be compared to the target location's value.

    The target location MUST be equal to the "value" value for the
    operation to be considered successful.

    Here, "equal" means that the value at the target location and the
    value conveyed by "value" are of the same JSON type, and that they
    are considered equal by the following rules for that type:

    o  strings: are considered equal if they contain the same number of
       Unicode characters and their code points are byte-by-byte equal.

    o  numbers: are considered equal if their values are numerically
       equal.

    o  arrays: are considered equal if they contain the same number of
       values, and if each value can be considered equal to the value at
       the corresponding position in the other array, using this list of
       type-specific rules.
    """

    op: ClassVar[Operation] = Operation.TEST
    value: V

    def apply(self, src: Union[object, dict, list]) -> None:
        if self.path == "/":
            value = src
        else:
            try:
                parent = functools.reduce(getvalue, self.path_parts[:-1], src)
                value = getvalue(parent, self.path_parts[-1])
            except Exception as err:
                raise AttributeError(
                    f"Cannot resolve path: {self.path}"
                ) from err

        if value != self.value:
            raise ValueError(f"Test operation failed for path:{self.path}")

        return src


_patch_map = {
    Operation.ADD: Add,
    Operation.COPY: Copy,
    Operation.MOVE: Move,
    Operation.REMOVE: Remove,
    Operation.REPLACE: Replace,
    Operation.TEST: Test,
}


def parse(
    *patches: dict[str, Any],
    transform_fn: Optional[Callable[[Any], Any]] = None,
) -> list[Patch]:
    """Parses the provided JSON patch dicts into Patch objects.

    Raises:
        TypeError: Any of the patches operations are invalid.
        ValueError: Any of the patches are invalid.

    Returns:
        Union[Patch, list[Patch]]: A single Patch if one patch dict was
          provided, otherwise a list of Patch objects.
    """

    parsed = []
    for patch in patches:
        try:
            op = Operation(patch["op"])
            patch_cls = _patch_map[op]
        except (ValueError, KeyError) as err:
            raise TypeError(f"Unsupported operation '{patch['op']}'") from err

        kwargs = {"path": patch["path"]}

        if op in (Operation.ADD, Operation.REPLACE, Operation.TEST):
            value = patch["value"]
            if transform_fn:
                value = transform_fn(value)
            kwargs.update(value=value)
        if op in (Operation.COPY, Operation.MOVE):
            kwargs.update(from_=patch["from"])

        try:
            parsed.append(patch_cls(**kwargs))
        except Exception as err:
            raise ValueError(f"Invalid operation '{op}'") from err

    return parsed
