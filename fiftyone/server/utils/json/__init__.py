"""

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any, Union
from bson import json_util

from starlette.responses import JSONResponse as StarletteJSONResponse

from fiftyone.server.utils.json.encoder import Encoder
from fiftyone.server.utils.json.jsonpatch import parse as parse_jsonpatch
from fiftyone.server.utils.json.serialization import deserialize, serialize


def dumps(obj: Any) -> str:
    """Serializes an object to a JSON-formatted string."""
    return json_util.dumps(obj, cls=Encoder)


def loads(s: Union[str, bytes, bytearray, None]) -> Any:
    """Deserializes a JSON-formatted string to a Python object."""
    return json_util.loads(s) if s else {}


class JSONResponse(StarletteJSONResponse):
    """Custom JSON response that uses the custom Encoder."""

    def render(self, content: Any) -> bytes:
        return dumps(content).encode("utf-8")
