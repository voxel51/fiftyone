"""
FiftyOne server json utilies.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId, json_util
from flask.json import JSONEncoder

from fiftyone.core.sample import Sample, SampleView
from fiftyone.core.stages import ViewStage
import fiftyone.core.utils as fou


def _handle_bytes(o):
    for k, v in o.items():
        if isinstance(v, bytes):
            o[k] = fou.deserialize_numpy_array(v).tolist()
        if isinstance(v, dict):
            o[k] = _handle_bytes(v)
    return o


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
            return _handle_bytes(o.to_mongo_dict())
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
