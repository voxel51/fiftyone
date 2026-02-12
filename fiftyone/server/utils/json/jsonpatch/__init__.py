"""
Apply JSON patch to python objects.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any, Callable, Iterable, Optional, Union

from fiftyone.server.utils.json.jsonpatch.exceptions import RootDeleteError
from fiftyone.server.utils.json.jsonpatch.methods import (
    add,
    copy,
    move,
    remove,
    replace,
    test,
)

from fiftyone.server.utils.json.jsonpatch.patch import (
    Patch,
    Operation,
    Add,
    Copy,
    Move,
    Remove,
    Replace,
    Test,
)

__PATCH_MAP = {
    Operation.ADD: Add,
    Operation.COPY: Copy,
    Operation.MOVE: Move,
    Operation.REMOVE: Remove,
    Operation.REPLACE: Replace,
    Operation.TEST: Test,
}


def parse(
    patches: Union[dict[str, Any], Iterable[dict[str, Any]]],
    *,
    transform_fn: Optional[Callable[[Any], Any]] = None,
) -> Union[Patch, list[Patch]]:
    """Parses the provided JSON patch dicts into Patch objects."""

    return_one = False
    if isinstance(patches, dict):
        patches = [patches]
        return_one = True
    elif not isinstance(patches, Iterable):
        raise TypeError("Patches must be a dict or an iterable of dicts")

    parsed = []
    for patch in patches:
        try:
            op_str = patch["op"]
            path = patch["path"]
        except KeyError as err:
            raise ValueError(f"Missing {err} field") from err

        try:
            op = Operation(op_str)
            patch_cls = __PATCH_MAP[op]
        except (ValueError, KeyError) as err:
            raise TypeError(f"Unsupported operation '{op_str}'") from err

        kwargs = {"path": path}
        try:
            if op in (Operation.ADD, Operation.REPLACE, Operation.TEST):
                kwargs.update(
                    value=(
                        transform_fn(patch["value"])
                        if transform_fn
                        else patch["value"]
                    )
                )

            if op in (Operation.COPY, Operation.MOVE):
                kwargs.update(from_=patch["from"])

            parsed.append(patch_cls(**kwargs))
        except Exception as err:
            raise ValueError(f"Invalid operation '{op_str}'") from err

    return parsed if not return_one else parsed[0]


def apply(
    target: Any,
    patches: Union[dict[str, Any], Iterable[dict[str, Any]]],
    *,
    transform_fn: Optional[Callable[[Any], Any]] = None,
) -> tuple[Any, list[str]]:
    """Parse and apply JSON patch operations to a target object.

    Args:
        target: The object to apply patches to
        patches: JSON patch operations (dict or list of dicts)
        transform_fn: Optional function to transform values before applying

    Returns:
        A tuple of (target, errors) where errors is a list of error messages
        for any patches that failed to apply

    Raises:
        RootDeleteError: If a remove operation targets the root. The caller
            must handle deletion at the parent level.
    """
    patches_list = [patches] if isinstance(patches, dict) else list(patches)

    parsed = parse(patches_list, transform_fn=transform_fn)
    if not isinstance(parsed, list):
        parsed = [parsed]

    errors = []
    for i, p in enumerate(parsed):
        try:
            target = p.apply(target)
        except RootDeleteError:
            raise
        except Exception as e:
            errors.append(f"Error applying patch `{patches_list[i]}`: {e}")

    return target, errors
