"""
Apply JSON patch to python objects.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import TypeVar, Union

import jsonpointer


T = TypeVar("T")
V = TypeVar("V")


def to_json_pointer(
    path: Union[str, jsonpointer.JsonPointer],
) -> jsonpointer.JsonPointer:
    """Converts a string path to a `jsonpointer.JsonPointer`."""

    if isinstance(path, jsonpointer.JsonPointer):
        return path

    try:
        return jsonpointer.JsonPointer(path)
    except jsonpointer.JsonPointerException as err:
        raise ValueError(f"Invalid JSON pointer path: {path}") from err


def get(src: T, path: Union[str, jsonpointer.JsonPointer]) -> V:
    """Gets a value from an object.

    Args:
        src (T): The source object.
        path (Union[str, jsonpointer.JsonPointer]): The JSON pointer path to
          resolve.

    Raises:
        AttributeError: If the path cannot be fully resolved.

    Returns:
        V: The resolved value.
    """
    try:
        pointer = to_json_pointer(path)

        value = src
        for name in pointer.parts:
            try:
                value = getattr(value, name)
                continue
            except AttributeError as attr_err:
                if hasattr(value, "__getitem__"):
                    try:
                        value = value[name]
                        continue
                    except TypeError as err:
                        if "list indices must be integers or slices" in str(
                            err
                        ):
                            idx = int(name)

                            if not 0 <= idx < len(value):
                                raise IndexError(
                                    "List index out of range"
                                ) from err

                            value = value[idx]
                            continue

                raise attr_err

        return value
    except Exception as err:
        raise AttributeError(f"Cannot resolve path: {path}: {err}") from err


def add(
    src: T, path: Union[str, jsonpointer.JsonPointer], value: V
) -> Union[T, V]:
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

    pointer = to_json_pointer(path)
    if not pointer.parts:
        return value

    target = get(src, jsonpointer.JsonPointer.from_parts(pointer.parts[:-1]))
    name = pointer.parts[-1]

    try:
        if hasattr(target, "__setitem__"):
            try:
                target[name] = value
            except TypeError as type_err:
                if "list indices must be integers or slices" not in str(
                    type_err
                ):
                    raise type_err

                if isinstance(target, list) and name == "-":
                    target.append(value)
                else:
                    try:
                        idx = int(name)
                    except ValueError as val_err:
                        raise val_err

                    if not 0 <= idx <= len(target):
                        raise IndexError(
                            "List index out of range"
                        ) from type_err

                    target.insert(idx, value)
        else:
            setattr(target, name, value)

    except Exception as err:
        raise ValueError(
            f"Unable to add value with path: {pointer.path}"
        ) from err

    return src


def copy(
    src: T,
    path: Union[str, jsonpointer.JsonPointer],
    from_: Union[str, jsonpointer.JsonPointer],
) -> T:
    """The "copy" operation copies the value at a specified location to the
     target location.

    The operation object MUST contain a "from" member, which is a string
    containing a JSON Pointer value that references the location in the
    target document to copy the value from.

    The "from" location MUST exist for the operation to be successful.

    This operation is functionally identical to an "add" operation at the
    target location using the value specified in the "from" member.
    """

    pointer = to_json_pointer(path)
    from_pointer = to_json_pointer(from_)

    value = get(src, from_pointer)
    add(src, pointer, value)
    return src


def move(
    src: T,
    path: Union[str, jsonpointer.JsonPointer],
    from_: Union[str, jsonpointer.JsonPointer],
) -> T:
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
    pointer = to_json_pointer(path)
    from_pointer = to_json_pointer(from_)

    value = get(src, from_pointer)
    remove(src, from_pointer)
    add(src, pointer, value)

    return src


def remove(src: T, path: Union[str, jsonpointer.JsonPointer]) -> T:
    """The "remove" operation removes the value at the target location.

    The target location MUST exist for the operation to be successful.

    If removing an element from an array, any elements above the
    specified index are shifted one position to the left.
    """

    pointer = to_json_pointer(path)
    # Root path "/" has parts=[''], empty path "" has parts=[]
    if pointer.path == "/" or not pointer.parts:
        # Clear the root document instead of raising an error
        # This allows root delete to work as part of multi-operation
        # patches like replace
        if hasattr(src, "clear"):
            src.clear()
        return src

    target = get(src, jsonpointer.JsonPointer.from_parts(pointer.parts[:-1]))
    name = pointer.parts[-1]

    # ensure value exists
    get(target, jsonpointer.JsonPointer.from_parts([name]))

    try:
        if hasattr(target, "__delitem__"):
            try:
                del target[name]
            except TypeError as err:
                if "list indices must be integers or slices" not in str(err):
                    raise err

                target.pop(int(name))
        else:
            delattr(target, name)

    except Exception as err:
        raise ValueError(
            f"Unable to remove value with path: {pointer.path}"
        ) from err

    return src


def replace(src: T, path: Union[str, jsonpointer.JsonPointer], value: V) -> T:
    """The "replace" operation replaces the value at the target location
    with a new value.  The operation object MUST contain a "value" member
    whose content specifies the replacement value.

    The target location MUST exist for the operation to be successful.

    This operation is functionally identical to a "remove" operation for
    a value, followed immediately by an "add" operation at the same
    location with the replacement value.
    """
    pointer = to_json_pointer(path)

    remove(src, pointer)
    add(src, pointer, value)

    return src


def test(src: T, path: Union[str, jsonpointer.JsonPointer], value: V) -> T:
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

    pointer = to_json_pointer(path)
    target = src if not pointer.parts else get(src, pointer)

    if value != target:
        raise ValueError(f"Test operation failed for path:{pointer.path}")

    return src
