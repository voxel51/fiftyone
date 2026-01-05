"""

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any, Union
import json

from bson import json_util
import numpy as np
from starlette.responses import JSONResponse as StarletteJSONResponse


class Encoder(json.JSONEncoder):
    """Custom JSON encoder that handles numpy types."""

    def default(self, o):
        """Override the default method to handle numpy types."""

        if isinstance(o, np.floating):
            return float(o)

        if isinstance(o, np.integer):
            return int(o)

        return json.JSONEncoder.default(self, o)


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
