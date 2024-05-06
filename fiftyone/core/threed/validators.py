"""
Simple validator utilities

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import re
from typing import Any, Iterable, Optional


def validate_bool(v: Any, nullable: bool = False):
    if v is None:
        if nullable:
            return None
        else:
            raise ValueError("Field cannot be None")
    return bool(v)


def validate_choice(v: Any, options: Iterable, nullable: bool = False):
    if nullable and v is None:
        return None

    if v not in options:
        raise ValueError(f"Value '{v}' not in options: {options}")

    return v


def validate_color(v: Optional[str], nullable: bool = False):
    if nullable and v is None:
        return None

    if not isinstance(v, str):
        raise ValueError(f"Color must be of string type: {v}")

    if not re.fullmatch(r"#[0-9a-f]{6}", v):
        raise ValueError(f"Color string '{v}' must be in the form #ffffff")

    return v


def validate_float(v: Any, nullable: bool = False):
    if nullable and v is None:
        return None
    try:
        return float(v)
    except TypeError as e:
        raise ValueError(e.args)


def validate_list(
    v: Any, length: Optional[int] = None, nullable: bool = False
) -> list:
    if nullable and v is None:
        return None
    try:
        item_list = list(v)
    except TypeError:
        raise ValueError(f"{type(v)} cannot be converted to list")

    if length is not None and len(item_list) != length:
        raise ValueError(f"Expected iterable of length {length}")

    return item_list


class BaseValidatedDataClass(object):
    def __eq__(self, other):
        return vars(self) == vars(other)

    def __setattr__(self, key, value):
        # If attribute is not a known property, and it's not a protected
        #   attribute, raise an error because this public property doesn't
        #   exist.
        if not isinstance(
            getattr(self.__class__, key, None), property
        ) and not key.startswith("_"):
            raise ValueError(
                f"Cannot set unknown property '{key}' on "
                f"'{self.__class__.__name__}'"
            )

        # All's well. Attr boy
        super().__setattr__(key, value)

    def __repr__(self):
        # Looks like:
        #   ClassName(prop1="foo", prop2=3.14159)
        attribute_strings = [
            f"{attribute.lstrip('_')}={repr(value)}"
            for attribute, value in vars(self).items()
        ]

        return f"{self.__class__.__name__}({', '.join(attribute_strings)})"
