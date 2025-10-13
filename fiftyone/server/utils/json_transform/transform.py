"""Transform a json value.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import Any, Callable, Type, TypeVar

T = TypeVar("T")

REGISTRY: dict[Type[T], Callable[[dict], T]] = {}


def register(
    cls: Type[T],  # pylint: disable=redefined-builtin
) -> Callable[[Callable[[dict], T]], Callable[[dict], T]]:
    """Register a validator function for a resource type.

    Args:
        cls Type[T]: The resource type

    Returns:
        Callable[[Callable[[dict], T]], Callable[[dict], T]]: A decorator
          that registers the decorated function as a validator for the given
          resource type.
    """

    def inner(fn: Callable[[dict], T]) -> Callable[[dict], T]:
        if not callable(fn):
            raise TypeError("fn must be callable")

        if cls in REGISTRY:
            raise ValueError(
                f"Resource type '{cls.__name__}' validator already registered"
            )

        REGISTRY[cls] = fn

        return fn

    return inner


def transform(
    value: Any,
) -> Any:
    """Transforms a patch value if there is a registered transform method.
    Args:
        value (Any): The patch value optionally containing "_cls" key.

    Returns:
        Any: The transformed value or the original value if no transform is found.
    """
    if not isinstance(value, dict):
        return value

    func = None
    cls_name = value.get("_cls")
    if cls_name:
        func = next(
            (fn for cls, fn in REGISTRY.items() if cls.__name__ == cls_name),
            None,
        )
        if not func:
            raise ValueError(f"No transform registered for class '{cls_name}'")
    return func(value) if func else value
