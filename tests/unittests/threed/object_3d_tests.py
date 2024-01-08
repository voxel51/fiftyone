"""
FiftyOne sample-related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import numpy as np

from fiftyone.core.threed import Euler, Object3D, Quaternion, Vector3


class Test3DBasicGeometry(unittest.TestCase):
    def test_euler_initialization(self):
        e = Euler(90, 45, 30)
        self.assertEqual((e.x, e.y, e.z), (90, 45, 30))

    def test_vector3_initialization(self):
        v = Vector3(1, 2, 3)
        self.assertEqual((v.x, v.y, v.z), (1, 2, 3))

    def test_quaternion_initialization(self):
        q = Quaternion()
        self.assertEqual((q.x, q.y, q.z, q.w), (0, 0, 0, 1))

    def test_euler_to_quaternion_conversion(self):
        e = Euler(90, 0, 0, degrees=True)
        q = e.to_quaternion()
        self.assertIsInstance(q, Quaternion)
        np.testing.assert_array_almost_equal(
            (q.x, q.y, q.z, q.w), (0.70710678, 0, 0, 0.70710678), decimal=5
        )

    def test_quaternion_to_euler_conversion(self):
        q = Quaternion(0.5609855, -0.4304593, 0.7010574, 0.092296)
        e = q.to_euler(degrees=True)
        self.assertIsInstance(e, Euler)
        np.testing.assert_array_almost_equal(
            (e.x, e.y, e.z), (90, 45, 120), decimal=5
        )


class TestObject3D(unittest.TestCase):
    def setUp(self):
        self.obj = Object3D()

    def test_position_updates_matrix(self):
        self.obj.position = Vector3(10, 20, 30)
        np.testing.assert_array_equal(
            self.obj.local_transform_matrix,
            np.array(
                [
                    [1, 0, 0, 10],
                    [0, 1, 0, 20],
                    [0, 0, 1, 30],
                    [0, 0, 0, 1],
                ]
            ),
        )

    def test_matrix_updates_position(self):
        self.obj.local_transform_matrix = np.array(
            [
                [1, 0, 0, 10],
                [0, 1, 0, 20],
                [0, 0, 1, 30],
                [0, 0, 0, 1],
            ]
        )
        np.testing.assert_array_equal(
            self.obj.position.to_arr(),
            np.array([10, 20, 30]),
        )

    def test_rotation_updates_matrix(self):
        self.obj.rotation = Euler(90, 0, 0, degrees=True)
        np.testing.assert_array_almost_equal(
            self.obj.local_transform_matrix,
            np.array(
                [
                    [1, 0, 0, 0],
                    [0, 0, -1, 0],
                    [0, 1, 0, 0],
                    [0, 0, 0, 1],
                ]
            ),
            decimal=5,
        )
        # also verify quaternion is updated
        np.testing.assert_array_almost_equal(
            self.obj.quaternion.to_arr(),
            np.array([0.70710678, 0, 0, 0.70710678]),
            decimal=5,
        )

    def test_matrix_updates_rotation(self):
        self.obj.local_transform_matrix = np.array(
            [
                [1, 0, 0, 0],
                [0, 0, -1, 0],
                [0, 1, 0, 0],
                [0, 0, 0, 1],
            ]
        )
        np.testing.assert_array_almost_equal(
            self.obj.rotation.to_arr(), np.array([1.5708, 0, 0]), decimal=5
        )
        # also verify quaternion is updated
        np.testing.assert_array_almost_equal(
            self.obj.quaternion.to_arr(),
            np.array([0.70710678, 0, 0, 0.70710678]),
            decimal=5,
        )

    def test_quaternion_updates_matrix(self):
        self.obj.quaternion = Quaternion(0.70710678, 0, 0, 0.70710678)
        np.testing.assert_almost_equal(
            self.obj.local_transform_matrix,
            np.array(
                [
                    [1, 0, 0, 0],
                    [0, 0, -1, 0],
                    [0, 1, 0, 0],
                    [0, 0, 0, 1],
                ]
            ),
            decimal=5,
        )
        # also verify euler is updated
        np.testing.assert_array_almost_equal(
            self.obj.rotation.to_arr(), np.array([1.570796, 0, 0]), decimal=5
        )

    def test_matrix_updates_quaternion(self):
        self.obj.local_transform_matrix = np.array(
            [
                [1, 0, 0, 0],
                [0, 0, -1, 0],
                [0, 1, 0, 0],
                [0, 0, 0, 1],
            ]
        )
        np.testing.assert_array_almost_equal(
            self.obj.quaternion.to_arr(),
            np.array([0.70710678, 0, 0, 0.70710678]),
            decimal=5,
        )
        # also verify euler is updated
        np.testing.assert_array_almost_equal(
            self.obj.rotation.to_arr(), np.array([1.5708, 0, 0]), decimal=5
        )

    def test_scale_updates_matrix(self):
        self.obj.scale = Vector3(2, 3, 4)
        np.testing.assert_array_equal(
            self.obj.local_transform_matrix,
            np.array(
                [
                    [2, 0, 0, 0],
                    [0, 3, 0, 0],
                    [0, 0, 4, 0],
                    [0, 0, 0, 1],
                ]
            ),
        )

    def test_matrix_updates_scale(self):
        self.obj.local_transform_matrix = np.array(
            [
                [2, 0, 0, 0],
                [0, 3, 0, 0],
                [0, 0, 4, 0],
                [0, 0, 0, 1],
            ]
        )
        np.testing.assert_array_equal(
            self.obj.scale.to_arr(),
            np.array([2, 3, 4]),
        )
