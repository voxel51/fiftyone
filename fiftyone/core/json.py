"""
FiftyOne JSON handling

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId, json_util
from datetime import date, datetime
from json import JSONEncoder
import math
import numpy as np

import eta.core.serial as etas

from fiftyone.core.sample import Sample, SampleView
from fiftyone.core.stages import ViewStage
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
    if isinstance(d, dict):
        return {k: stringify(v, d.get("_cls", None)) for k, v in d.items()}

    if isinstance(d, (list, tuple)):
        return [stringify(v) for v in d]

    if isinstance(d, bytes):
        return _handle_numpy_array(d, _cls)
    elif isinstance(d, (date, datetime)):
        return _handle_date(d)
    elif isinstance(d, ObjectId):
        return str(d)
    elif _is_invalid_number(d):
        return str(d)

    return d


class FiftyOneJSONEncoder(JSONEncoder):
    """JSON encoder for FiftyOne network comms.

    Any classes with non-standard serialization methods should
    be accounted for in the `default()` method.
    """

    def default(self, o):  # pylint: disable=E0202
        """Returns the serialized representation of the objects

        Args:
            o: the object

        Returns:
            str
        """
        if isinstance(o, (Sample, SampleView)):
            return _handle_bytes(o.to_mongo_dict(include_id=True))
        if issubclass(type(o), ViewStage):
            return o._serialize()
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, float):
            return json_util.dumps(o)
        if isinstance(o, etas.Serializable):
            return o.serialize()

        try:
            return super().default(o)
        except:
            return None

    @staticmethod
    def dumps(data, *args, **kwargs) -> str:
        kwargs["cls"] = FiftyOneJSONEncoder
        return json_util.dumps(
            json_util.loads(
                json_util.dumps(data, *args, **kwargs),
                parse_constant=lambda c: c,
            ),
            **kwargs
        )

    @staticmethod
    def loads(*args, **kwargs) -> dict:
        return json_util.loads(*args, **kwargs)

    @staticmethod
    def process(data, *args, **kwargs):
        kwargs["cls"] = FiftyOneJSONEncoder
        return json_util.loads(
            json_util.dumps(data, *args, **kwargs), parse_constant=lambda c: c
        )
