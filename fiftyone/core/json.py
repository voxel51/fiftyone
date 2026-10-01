"""
FiftyOne JSON handling

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from base64 import b64encode
import dataclasses
from datetime import date, datetime
import io
import math
import zlib

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


def _read_numpy_header(raw):
    try:
        with io.BytesIO(zlib.decompress(raw)) as f:
            version = np.lib.format.read_magic(f)
            if version == (1, 0):
                return np.lib.format.read_array_header_1_0(f)

            if version == (2, 0):
                return np.lib.format.read_array_header_2_0(f)
    except Exception:
        pass

    return None


def _handle_numpy_array(raw, _cls=None):
    header = _read_numpy_header(raw)

    if _cls not in _MASK_CLASSES:
        if header is not None:
            return str(header[0])

        return str(fou.deserialize_numpy_array(raw).shape)

    # Stored arrays are already serialized as C-ordered, so only reordering
    # them requires a full round trip
    if header is not None and not header[1]:
        return b64encode(raw).decode("ascii")

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
        except Exception:
            # with plugins, bytes can represent other data, omit for non
            return str(d)

    elif isinstance(d, (date, datetime)):
        return _handle_date(d)
    elif isinstance(d, ObjectId):
        return str(d)
    elif _is_invalid_number(d):
        return str(d)

    return d
