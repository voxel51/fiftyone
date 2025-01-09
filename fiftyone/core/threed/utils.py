"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import re

FO3D_VERSION_KEY = "__FO3D_VERSION"


def camel_to_snake(name):
    """Convert camelCase to snake_case.

    Args:
        name: the camelCase string

    Returns:
        a snake_case string
    ."""
    s1 = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub("([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def convert_keys_to_snake_case(d):
    """Convert all keys in a dictionary from camelCase to snake_case.

    Args:
        d: the dictionary

    Returns:
        a dictionary with snake case keys
    """
    if isinstance(d, dict):
        return {
            (
                camel_to_snake(k) if k != FO3D_VERSION_KEY else k
            ): convert_keys_to_snake_case(v)
            for k, v in d.items()
        }
    elif isinstance(d, list):
        return [convert_keys_to_snake_case(item) for item in d]
    else:
        return d
