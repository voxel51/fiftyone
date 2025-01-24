"""
FiftyOne 3D transformation unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np

from fiftyone.core import threed


class Test3DBasicGeometry(unittest.TestCase):
    def test_euler_initialization(self):
        e = threed.Euler(90, 45, 30)
        self.assertEqual((e.x, e.y, e.z), (90, 45, 30))

    def test_vector3_initialization(self):
        v = threed.Vector3(1, 2, 3)
        self.assertEqual((v.x, v.y, v.z), (1, 2, 3))

    def test_quaternion_initialization(self):
        q = threed.Quaternion()
        self.assertEqual((q.x, q.y, q.z, q.w), (0, 0, 0, 1))

    def test_euler_to_quaternion_conversion(self):
        e = threed.Euler(90, 0, 0, degrees=True)
        q = e.to_quaternion()
        self.assertIsInstance(q, threed.Quaternion)
        np.testing.assert_array_almost_equal(
            (q.x, q.y, q.z, q.w), (0.70710678, 0, 0, 0.70710678), decimal=5
        )

    def test_quaternion_to_euler_conversion(self):
        q = threed.Quaternion(0.5609855, -0.4304593, 0.7010574, 0.092296)
        e = q.to_euler(degrees=True)
        self.assertIsInstance(e, threed.Euler)
        np.testing.assert_array_almost_equal(
            (e.x, e.y, e.z), (90, 45, 120), decimal=5
        )


class TestTransformationDataclasses(unittest.TestCase):
    def test_vector3(self):
        obj = threed.Vector3()
        self.assertEqual(
            obj,
            threed.Vector3(0.0, 0.0, 0.0),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        self.assertRaises(AttributeError, setattr, obj, "x", 51.51)
        self.assertRaises(AttributeError, setattr, obj, "y", 51.51)
        self.assertRaises(AttributeError, setattr, obj, "z", 51.51)

        obj = threed.Vector3(51.51, 52.52, 53.53)
        self.assertEqual((obj.x, obj.y, obj.z), (51.51, 52.52, 53.53))

        self.assertTrue(
            np.array_equal(obj.to_arr(), np.array([51.51, 52.52, 53.53]))
        )

    def test_euler(self):
        obj = threed.Euler()
        self.assertEqual(
            obj,
            threed.Euler(0.0, 0.0, 0.0, False, "XYZ"),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        self.assertRaises(AttributeError, setattr, obj, "x", 51.51)
        self.assertRaises(AttributeError, setattr, obj, "y", 51.51)
        self.assertRaises(AttributeError, setattr, obj, "z", 51.51)
        self.assertRaises(AttributeError, setattr, obj, "degrees", True)
        self.assertRaises(AttributeError, setattr, obj, "sequence", "ZYX")

        obj = threed.Euler(51.51, 52.52, 53.53, True, "ZYX")
        self.assertEqual(
            (obj.x, obj.y, obj.z, obj.degrees, obj.sequence),
            (51.51, 52.52, 53.53, True, "ZYX"),
        )

        self.assertRaises(
            ValueError, threed.Euler, 0.0, 0.0, 0.0, False, "blah"
        )
        self.assertRaises(ValueError, threed.Euler, 0.0, 0.0, 0.0, False, None)
        self.assertRaises(ValueError, threed.Euler, "error", 0.0, 0.0)
        self.assertRaises(ValueError, threed.Euler, 0.0, "error", 0.0)
        self.assertRaises(ValueError, threed.Euler, 0.0, 0.0, "error")

        self.assertTrue(
            np.array_equal(obj.to_arr(), np.array([51.51, 52.52, 53.53]))
        )

    def test_quaternion(self):
        obj = threed.Quaternion()
        self.assertEqual(
            obj,
            threed.Quaternion(0.0, 0.0, 0.0, 1.0),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        self.assertRaises(AttributeError, setattr, obj, "x", 51.51)
        self.assertRaises(AttributeError, setattr, obj, "y", 51.51)
        self.assertRaises(AttributeError, setattr, obj, "z", 51.51)
        self.assertRaises(AttributeError, setattr, obj, "w", 51.51)

        obj = threed.Quaternion(51.51, 52.52, 53.53, 54.54)
        self.assertEqual(
            (obj.x, obj.y, obj.z, obj.w),
            (51.51, 52.52, 53.53, 54.54),
        )

        self.assertRaises(
            ValueError, threed.Quaternion, "error", 0.0, 0.0, 1.0
        )
        self.assertRaises(
            ValueError, threed.Quaternion, 0.0, "error", 0.0, 1.0
        )
        self.assertRaises(
            ValueError, threed.Quaternion, 0.0, 0.0, "error", 1.0
        )
        self.assertRaises(
            ValueError, threed.Quaternion, 0.0, 0.0, 0.0, "error"
        )

        self.assertTrue(
            np.array_equal(
                obj.to_arr(), np.array([51.51, 52.52, 53.53, 54.54])
            )
        )
