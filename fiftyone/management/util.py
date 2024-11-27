"""
Management utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import re
from typing import Any

CAMEL_TO_SNAKE_REGEX = re.compile(r"(?<!^)(?=[A-Z])")


def camel_to_snake(variable: str):
    return CAMEL_TO_SNAKE_REGEX.sub("_", variable).lower()


def camel_to_snake_container(value: Any):
    if isinstance(value, list):
        return [camel_to_snake_container(i) for i in value]
    elif isinstance(value, dict):
        return {
            camel_to_snake(k): camel_to_snake_container(v)
            for k, v in value.items()
        }
    else:
        return value
