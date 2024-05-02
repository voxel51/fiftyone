"""
Fiftyone 3D Scene.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import Optional, Union

from pydantic import validator as field_validator

from .transformation import Vec3UnionType, Vector3


def normalize_to_vec3(v: Optional[Vec3UnionType]) -> Union[Vector3, None]:
    if v is None:
        return None

    if isinstance(v, (int, float)):
        v = Vector3(v, v, v)
    elif isinstance(v, (list, tuple)) and len(v) == 3:
        v = Vector3(*v)

    if not isinstance(v, Vector3):
        raise ValueError("Expected a list / tuple of length 3 or a Vector3")

    return v


def vec3_normalizing_validator(field: str) -> classmethod:
    decorator = field_validator(field, allow_reuse=True)
    validator_class_method = decorator(normalize_to_vec3)
    return validator_class_method
