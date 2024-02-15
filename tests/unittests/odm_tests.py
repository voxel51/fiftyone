"""
FiftyOne odm unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from bson import ObjectId

import fiftyone as fo


class ColorSchemeTests(unittest.TestCase):
    def test_color_scheme_serialization(self):
        color_scheme = fo.ColorScheme.from_dict({})
        self.assertIsInstance(color_scheme.id, str)

        d = fo.ColorScheme().to_dict()
        self.assertIsInstance(d["id"], str)
