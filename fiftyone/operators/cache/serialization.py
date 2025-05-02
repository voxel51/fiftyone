"""
Execution cache serialization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np
from datetime import datetime, date

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
    elif isinstance(value, list):
        return [auto_serialize(v) for v in value]
    elif isinstance(value, tuple):
        return {
            "_cls": "tuple",
            "values": [auto_serialize(v) for v in value],
        }
    elif isinstance(value, set):
        return {
            "_cls": "set",
            "values": [auto_serialize(v) for v in value],
        }
    elif isinstance(value, datetime):
        return {"_cls": "datetime", "value": value.isoformat()}
    elif isinstance(value, date):
        return {"_cls": "date", "value": value.isoformat()}
    elif isinstance(value, (int, float, str, bool)) or value is None:
        return value
    elif isinstance(value, np.ndarray):
        return value.tolist()
    elif isinstance(value, np.generic):
        return value.item()
    raise TypeError(f"Cannot serialize value of type {type(value)}: {value}")


def auto_deserialize(value):
    """
    Deserializes a value from the execution cache.

    Args:
        value: the value to deserialize

    Returns:
        The deserialized value.
    """
    if focu._is_sample_dict(value):
        value = {k: v for k, v in value.items() if k != "_cls"}
        return fo.Sample.from_dict(value)
    elif isinstance(value, dict) and "_cls" in value:
        cls = value["_cls"]
        if cls == "tuple":
            return tuple(auto_deserialize(v) for v in value["values"])
        elif cls == "set":
            return set(auto_deserialize(v) for v in value["values"])
        elif cls == "date":
            return datetime.fromisoformat(value["value"]).date()
        elif cls == "datetime":
            return datetime.fromisoformat(value["value"])
        raise TypeError(f"Cannot deserialize value of type {cls}: {value}")
    elif isinstance(value, str):
        return value
    elif isinstance(value, dict):
        return {str(k): auto_deserialize(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [auto_deserialize(v) for v in value]
    elif isinstance(value, tuple):
        return tuple(auto_deserialize(v) for v in value)
    elif isinstance(value, set):
        return set(auto_deserialize(v) for v in value)
    else:
        return value
