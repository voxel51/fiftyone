"""
Execution cache serialization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.operators.cache.utils as focu


def auto_serialize(value):
    """
    Serializes a value for storage in the execution cache.

    Args:
        value: the value to serialize

    Returns:
        The serialized value.
    """
    if isinstance(value, fo.Sample):
        return focu._make_sample_dict(value)
    if isinstance(value, etas.Serializable):
        return value.serialize()
    elif hasattr(value, "to_dict"):
        return value.to_dict()
    elif hasattr(value, "to_json"):
        return value.to_json()
    elif isinstance(value, dict):
        return {str(k): auto_serialize(v) for k, v in value.items()}
    elif isinstance(value, (list, tuple, set)):
        return [auto_serialize(v) for v in value]
    elif isinstance(value, (int, float, str, bool)):
        return value
    raise TypeError(f"Cannot serialize value of type {type(value)}: {value}")


def auto_deserialize(value):
    """
    Deserializes a value from the execution cache.

    Args:
        value: the value to deserialize

    Returns:
        The deserialized value.
    """
    if isinstance(value, str):
        return focu._try_parse_date(value)
    elif focu._is_sample_dict(value):
        value = {k: v for k, v in value.items() if k != "_cls"}
        return fo.Sample.from_dict(value)
    elif isinstance(value, dict):
        return {str(k): auto_deserialize(v) for k, v in value.items()}
    elif isinstance(value, (list, tuple, set)):
        return [auto_deserialize(v) for v in value]
    else:
        return value
