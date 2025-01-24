"""
FiftyOne Server decorators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np

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
