"""
FiftyOne server json utilies.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId, json_util
from json import JSONEncoder
from collections import OrderedDict

import numpy as np

from fiftyone.core.sample import Sample, SampleView
from fiftyone.core.stages import ViewStage
import fiftyone.core.utils as fou


def _handle_bytes(o):
    for k, v in o.items():
        if isinstance(v, bytes):
            o[k] = str(fou.deserialize_numpy_array(v).shape)
        elif isinstance(v, dict):
            o[k] = _handle_bytes(v)
    return o


def _handle_numpy_array(raw, key=None):
    if key != "mask":
        return str(fou.deserialize_numpy_array(raw).shape)
    return fou.serialize_numpy_array(
        fou.deserialize_numpy_array(raw), ascii=True
    )


def convert(d):
    if isinstance(d, (dict, OrderedDict)):
        for k, v in d.items():
            if isinstance(v, ObjectId):
                d[k] = str(v)
            elif isinstance(v, (dict, OrderedDict, list)):
                convert(v)
            elif isinstance(v, bytes):
                d[k] = _handle_numpy_array(v, k)
    if isinstance(d, list):
        for idx, i in enumerate(d):
            if isinstance(i, (dict, OrderedDict, list)):
                convert(i)
            elif isinstance(i, ObjectId):
                d[idx] = str(i)
            elif isinstance(i, bytes):
                d[idx] = _handle_numpy_array(i)


class FiftyOneJSONEncoder(JSONEncoder):
    """JSON encoder for the FiftyOne server.

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
        return super().default(o)

    @staticmethod
    def dumps(*args, **kwargs):
        """Defined for overriding the default SocketIO `json` interface"""
        kwargs["cls"] = FiftyOneJSONEncoder
        return json_util.dumps(
            json_util.loads(
                json_util.dumps(*args, **kwargs), parse_constant=lambda c: c
            ),
            **kwargs
        )

    @staticmethod
    def loads(*args, **kwargs):
        """Defined for overriding the default SocketIO `json` interface"""
        return json_util.loads(*args, **kwargs)
