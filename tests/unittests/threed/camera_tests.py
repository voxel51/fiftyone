"""
FiftyOne 3D Camera unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.core import threed

from fiftyone.core.threed.utils import convert_keys_to_snake_case

from dataclass_test_utils import (
    assert_choice_prop,
    assert_float_prop,
    assert_vec3_prop,
)


class TestCamera(unittest.TestCase):
    def test_it(self):
        obj = threed.PerspectiveCamera()
        self.assertEqual(
            obj,
            threed.PerspectiveCamera(
                None, None, None, None, 50.0, 0.1, 2000.0
            ),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_vec3_prop(self, obj, "position", nullable=True)
        assert_vec3_prop(self, obj, "look_at", nullable=True)
        assert_choice_prop(self, obj, "up", ["X", "Y", "Z"], nullable=True)
        assert_float_prop(self, obj, "aspect", True)
        assert_float_prop(self, obj, "fov")
        assert_float_prop(self, obj, "near")
        assert_float_prop(self, obj, "far")

        obj2 = threed.PerspectiveCamera._from_dict(
            convert_keys_to_snake_case(obj.as_dict())
        )
        self.assertEqual(obj, obj2)
