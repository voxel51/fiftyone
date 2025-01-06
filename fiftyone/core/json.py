"""
FiftyOne JSON handling

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
from datetime import date, datetime
import math

from bson import ObjectId
import numpy as np

import fiftyone.core.utils as fou


_MASK_CLASSES = {"Detection", "Heatmap", "Segmentation"}


def _handle_bytes(o):
    for k, v in o.items():
        if isinstance(v, bytes):
            o[k] = str(fou.deserialize_numpy_array(v).shape)
        elif isinstance(v, dict):
            o[k] = _handle_bytes(v)

    return o


def _handle_numpy_array(raw, _cls=None):
    if _cls not in _MASK_CLASSES:
        return str(fou.deserialize_numpy_array(raw).shape)

    array = fou.deserialize_numpy_array(raw)

    if np.isfortran(array):
        array = np.ascontiguousarray(array)

    return fou.serialize_numpy_array(array, ascii=True)


def _handle_date(dt):
    return {
        "_cls": "DateTime",
        "datetime": fou.datetime_to_timestamp(dt),
    }


def _is_invalid_number(value):
    if not isinstance(value, float):
        return False

    return math.isnan(value) or math.isinf(value)


def stringify(d, _cls=None):
    """Converts unsafe JSON types to strings

    Args:
        d: serializable data

    Returns:
        a stringified version of the data
    """
    if dataclasses.is_dataclass(d):
        d = dataclasses.asdict(d)

    if isinstance(d, dict):
        for k in d:
            d[k] = stringify(d[k], d.get("_cls", None))
        return d

    if isinstance(d, tuple):
        return (stringify(v) for v in d)

    if isinstance(d, list):
        for i, v in enumerate(d):
            d[i] = stringify(v)

        return d

    if isinstance(d, bytes):
        try:
            # historically, bytes were used for numpy arrays
            return _handle_numpy_array(d, _cls)
        except:
            # with plugins, bytes can represent other data, omit for non
            return str(d)

    elif isinstance(d, (date, datetime)):
        return _handle_date(d)
    elif isinstance(d, ObjectId):
        return str(d)
    elif _is_invalid_number(d):
        return str(d)

    return d
