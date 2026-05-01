"""
FiftyOne Server decorators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import unittest
from unittest.mock import AsyncMock, MagicMock

import numpy as np

from fiftyone.server import decorators
from fiftyone.server.decorators import create_response


class TestNumPyResponse(unittest.IsolatedAsyncioTestCase):
    async def test_numpy_response(self):
        await create_response(
            {
                "float16": np.array([16.0], dtype=np.float16),
                "float32": np.array([32.0], dtype=np.float32),
                "float64": np.array([64.0], dtype=np.float64),
                "int8": np.array([8], dtype=np.int8),
                "int16": np.array([8], dtype=np.int16),
                "int32": np.array([8], dtype=np.int32),
                "int64": np.array([8], dtype=np.int64),
                "uint8": np.array([8], dtype=np.uint8),
                "uint6": np.array([8], dtype=np.uint16),
                "uint32": np.array([8], dtype=np.uint32),
                "uint64": np.array([8], dtype=np.uint64),
            }
        )


class TestRouteDecorator(unittest.IsolatedAsyncioTestCase):
    async def test_route_parses_json_body_by_default(self):
        class Endpoint:
            @decorators.route
            async def post(self, request, data):
                return {"value": data["value"]}

        request = MagicMock()
        request.body = AsyncMock(return_value=b'{"value": "ok"}')

        # pylint: disable-next=no-value-for-parameter
        response = await Endpoint().post(request)

        request.body.assert_awaited_once()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.body), {"value": "ok"})

    async def test_route_can_skip_body_parsing(self):
        class Endpoint:
            @decorators.route(parse_body=False)
            async def get(self, request):
                return {"value": request.path_params["value"]}

        request = MagicMock()
        request.body = AsyncMock(side_effect=AssertionError("unexpected body"))
        request.path_params = {"value": "ok"}

        response = await Endpoint().get(request)

        request.body.assert_not_called()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.body), {"value": "ok"})
