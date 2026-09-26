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


# Enough inflated bytes to hold a ``.npy`` header: magic + version + header
# length + the dict literal. Structured dtypes can run longer; they fall
# through to the full decode below
_NPY_HEADER_PEEK_BYTES = 4096


def _peek_numpy_header(raw):
    """Reads the ``.npy`` header of a serialized array without inflating the
    array body.

    Returns ``(shape, fortran_order)``, or ``None`` when the header cannot be
    read from the first :data:`_NPY_HEADER_PEEK_BYTES` inflated bytes.
    """
    try:
        head = zlib.decompressobj().decompress(raw, _NPY_HEADER_PEEK_BYTES)
        with io.BytesIO(head) as f:
            major, _ = np.lib.format.read_magic(f)
            if major == 1:
                shape, fortran_order, _ = np.lib.format.read_array_header_1_0(
                    f
                )
            else:
                shape, fortran_order, _ = np.lib.format.read_array_header_2_0(
                    f
                )
    except Exception:
        return None

    return shape, fortran_order


def _handle_numpy_array(raw, _cls=None):
    # The stored bytes are already the wire format (``np.save`` + zlib), so a
    # C-ordered array only needs base64. Inflating, re-saving, and
    # re-compressing a dense mask costs ~40ms per 1080p frame, which was the
    # bulk of a video label window's response time
    header = _peek_numpy_header(raw)

    if header is not None:
        shape, fortran_order = header

        if _cls not in _MASK_CLASSES:
            return str(tuple(shape))

        if not fortran_order:
            return b64encode(raw).decode("ascii")

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
