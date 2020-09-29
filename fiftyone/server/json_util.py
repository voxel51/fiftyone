"""
FiftyOne server json utilies.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId, json_util
from flask.json import JSONEncoder
from collections import OrderedDict

from fiftyone.core.sample import Sample, SampleView
from fiftyone.core.stages import ViewStage


def _objectid_to_str(d):
    if isinstance(d, (dict, OrderedDict)):
        for k, v in d.items():
            if isinstance(v, ObjectId):
                d[k] = str(v)
            elif isinstance(v, (dict, OrderedDict, list)):
                _objectid_to_str(v)
    if isinstance(d, list):
        for idx, i in enumerate(d):
            if isinstance(i, (dict, OrderedDict, list)):
                _objectid_to_str(i)
            elif isinstance(i, ObjectId):
                d[idx] = str(i)


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
            return o.to_mongo_dict()
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
        _objectid_to_str(args[0])
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
