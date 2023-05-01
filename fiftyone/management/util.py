"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import re

CAMEL_TO_SNAKE_REGEX = re.compile(r"(?<!^)(?=[A-Z])")


def camel_to_snake(variable: str):
    return CAMEL_TO_SNAKE_REGEX.sub("_", variable).lower()
