"""
Apply JSON patch to python objects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|


### EXAMPLE FOR PATCHING SAMPLE ###
def patch_sample(sample, *patches: Patch) -> None:
    for patch in patches:
        kwargs = {}
        if patch.op == Operation.ADD:
            # TODO: add sample transformation/validation logic as needed
            # kwargs.update(transform=...)
            ...
        if patch.op == Operation.REPLACE:
            # TODO: add sample transformation/validation logic as needed
            # kwargs.update(transform=...)
            ...

        patch.apply(sample, **kwargs)

    # sample.save()
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
    Type,
    TypeVar,
    Union,
)

import jsonpatch


T = TypeVar("T")


class Operation(str, enum.Enum):
    """The type of JSON Patch operation."""

    ADD = "add"
    REMOVE = "remove"
    REPLACE = "replace"
    MOVE = "move"
    COPY = "copy"
    TEST = "test"


@dataclasses.dataclass(frozen=True)
class Patch(abc.ABC):
    """A JSON Patch operation."""

    op: ClassVar[Operation]
    path: str

    @staticmethod
    def __get_attr_or_item(
        target: Union[object, dict, list], accessor: str
    ) -> Any:
        """Gets an attribute or item from a target object, dict, or list.

        Args:
            target (Union[object, dict, list]): The target object, dict, or
              list.
            accessor (str): The name, key, or index to retrieve.

        Raises:
            TypeError: If target is a list and the accessor cannot be cast to
              an integer.
            IndexError: If target is a list and the index (cast from accessor)
              is out of range.
            KeyError: If the target is dict and the specified key (accessor)
              does not exist.
            AttributeError: If the target does not have the specified
                attribute (accessor).
        Returns:
            Any: The value at the specified key or index.
        """

        if isinstance(target, list):
            try:
                return target[int(accessor)]
            except ValueError as err:
                raise TypeError("List indices must be integers") from err
            except IndexError as err:
                raise IndexError("List index out of range") from err

        elif isinstance(target, dict):
            try:
                return target[accessor]
            except KeyError as err:
                raise err

        try:
            return getattr(target, accessor)
        except AttributeError as err:
            raise err

    @classmethod
    def get_value(
        cls, target: Union[object, dict, list], accessors: list[str]
    ) -> Any:
        """Gets the field using the provided keys from the target object,
        dict, or list.

        Args:
            target (Union[object, dict, list]): The target object, dict, or
              list.
            accessors (list[str]): The list of names, keys, and/or indexes to
              retrieve a value for.

        Raises:
            AttributeError: If the accessors cannot be fully resolved.

        Returns:
            Any: The value from the specified accessors.
        """
        try:
            return functools.reduce(cls.__get_attr_or_item, accessors, target)
        except (TypeError, IndexError, KeyError, AttributeError) as err:
            raise AttributeError(
                f"Unable to get value at path: /{'/'.join(accessors)}"
            ) from err

    @functools.cached_property
    def accessors(self) -> list[str]:
        """The list of accessors in the path."""
        return [accessor for accessor in self.path.split("/") if accessor]

    def get_field(self, target: Union[object, dict, list]) -> Any:
        """Gets the field of the path from the target object, dict, or list.

        Args:
            target (Union[object, dict, list]): The target object, dict, or
              list.
            keys (list[str]): The list of keys in the path.

        Raises:
            AttributeError: If the path cannot be fully resolved.

        Returns:
            Any: The value at the specified path.
        """
        return self.get_value(target, self.accessors)

    def get_parent_field(self, target: Union[object, dict, list]) -> Any:
        """Gets the immediate parent field of the path from the target object,
        dict, or list.

        Args:
            target (Union[object, dict, list]): The target object, dict, or
              list.
            keys (list[str]): The list of keys in the path.

        Raises:
            AttributeError: If the path cannot be fully resolved.

        Returns:
            Any: The value at the specified path.
        """

        return self.get_value(target, self.accessors[:-1])

    @abc.abstractmethod
    def apply(self, target: Union[object, dict, list], **_) -> None:
        """Applies the patch operation to the target object, dict, or list.

        Args:
            target (Union[object, dict, list]): The target object, dict, or
              list.

        Raises:
            AttributeError: If the path cannot be fully resolved.
        """


@dataclasses.dataclass(frozen=True)
class Add(Patch, Generic[T]):
    """Adds a value to a list field."""

    op: ClassVar[Operation] = Operation.ADD
    value: T

    def apply(
        self,
        target: Union[object, dict, list],
        *,
        transform: Optional[Callable[[T], Any]] = None,
        **_,
    ) -> None:
        """Applies the add patch operation to the target object, dict, or list.

        Args:
            target (Union[object, dict, list]): The target object, dict, or
              list.
            transform (Optional[Callable[[T], Any]], optional): A function to
              transform the value before applying the patch. Defaults to None.

        Raises:
            AttributeError: If the path cannot be fully resolved.
            RuntimeError: If an error occurs while transforming the value.
        """

        field = self.get_field(target)

        if not isinstance(field, list):
            raise ValueError("Can only add to lists")

        # TODO: read more about add and implement finer details

        value = self.value
        if transform is not None:
            try:
                value = transform(self.value)
            except Exception as err:
                raise RuntimeError("Error transforming value") from err

        field.append(value)


@dataclasses.dataclass(frozen=True)
class Copy(Patch):
    """Copies a value from one path to another."""

    op: ClassVar[Operation] = Operation.COPY
    from_: str

    def apply(self, target: Union[object, dict, list], **_) -> None:
        raise NotImplementedError()


@dataclasses.dataclass(frozen=True)
class Move(Patch):
    """Moves a value from one path to another."""

    op: ClassVar[Operation] = Operation.MOVE
    from_: str

    def apply(self, target: Union[object, dict, list], **_) -> None:
        raise NotImplementedError()


@dataclasses.dataclass(frozen=True)
class Remove(Patch):
    """Removes a value from a list field."""

    op: ClassVar[Operation] = Operation.REMOVE

    def apply(self, target: Union[object, dict, list], **_) -> None:
        parent_field = self.get_parent_field(target)

        if not isinstance(parent_field, list):
            raise ValueError("Can only remove from lists")

        parent_field.pop(int(self.accessors[-1]))


@dataclasses.dataclass(frozen=True)
class Replace(Patch, Generic[T]):
    """Replaces a value at a given path."""

    op: ClassVar[Operation] = Operation.REPLACE
    value: T

    def apply(
        self,
        target: Union[object, dict, list],
        *,
        transform: Optional[Callable[[T], Any]] = None,
        **_,
    ) -> None:
        """Applies the replace patch operation to the target object, dict, or
        list.

        Args:
            target (Union[object, dict, list]): The target object, dict, or
              list.
            transform (Optional[Callable[[T], Any]], optional): A function to
              transform the value before applying the patch. Defaults to None.

        Raises:
            AttributeError: If the path cannot be fully resolved.
            RuntimeError: If an error occurs while transforming the value.
        """

        parent_field = self.get_parent_field(target)

        value = self.value
        if transform is not None:
            try:
                value = transform(self.value)
            except Exception as err:
                raise RuntimeError("Error transforming value") from err

        try:
            accessor = self.accessors[-1]
            if isinstance(parent_field, list):
                try:
                    parent_field[int(accessor)] = value
                except ValueError as err:
                    raise TypeError("List indices must be integers") from err
                except IndexError as err:
                    raise IndexError("List index out of range") from err
            elif isinstance(parent_field, dict):
                try:
                    parent_field[accessor] = value
                except KeyError as err:
                    raise err

            try:
                setattr(parent_field, accessor, value)
            except AttributeError as err:
                raise err
        except (TypeError, IndexError, KeyError, AttributeError) as err:
            raise AttributeError(
                f"Unable to set value at path: /{'/'.join(self.accessors)}"
            ) from err


@dataclasses.dataclass(frozen=True)
class Test(Patch, Generic[T]):
    """Tests that a value at a given path matches the provided value."""

    op: ClassVar[Operation] = Operation.TEST
    value: T

    def apply(self, target: Union[object, dict, list], **_) -> None:
        raise NotImplementedError()


def parse(*patches: dict[str, Any]) -> Union[Patch, list[Patch]]:
    """Parses the provided JSON patch dicts into Patch objects.

    Raises:
        ValueError: Any of the patches are invalid.

    Returns:
        Union[Patch, list[Patch]]: A single Patch if one patch dict was
          provided, otherwise a list of Patch objects.
    """

    try:
        jsonpatch.JsonPatch(patches)
    except jsonpatch.JsonPatchException as err:
        raise ValueError("Invalid patch format") from err

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
