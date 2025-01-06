"""
FiftyOne Object3D unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np

from fiftyone.core.threed import Euler, Object3D, Quaternion, Vector3


class TestObject3DMatrixUpdates(unittest.TestCase):
    def setUp(self):
        self.obj = Object3D("TestObject")

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


class TestObject3DSerialization(unittest.TestCase):
    def testas_dict(self):
        obj = Object3D(name="TestObject", visible=True)
        obj.position = Vector3(1.0, 2.0, 3.0)
        obj.rotation = Euler(90.0, 0.0, 90.0, degrees=True)
        obj.scale = Vector3(1.5, 2.0, 0.5)

        child_obj = Object3D(name="ChildObject", visible=False)
        grandchild_obj_1 = Object3D(name="GrandchildObject1", visible=True)
        grandchild_obj_2 = Object3D(name="GrandchildObject2", visible=True)
        child_obj.children = [grandchild_obj_1, grandchild_obj_2]
        obj.children = [child_obj]

        dict_data = obj.as_dict()

        self.assertEqual(dict_data["name"], "TestObject")
        self.assertTrue(dict_data["visible"])

        np.testing.assert_equal(
            dict_data["position"], np.array([1.0, 2.0, 3.0])
        )

        np.testing.assert_almost_equal(
            dict_data["quaternion"],
            np.array([0.5, -0.5, 0.5, 0.5]),
            decimal=5,
        )

        np.testing.assert_equal(dict_data["scale"], np.array([1.5, 2.0, 0.5]))

        self.assertEqual(len(dict_data["children"]), 1)
        child_dict = dict_data["children"][0]
        self.assertEqual(child_dict["name"], "ChildObject")

        self.assertEqual(len(child_dict["children"]), 2)
        grandchild_dict_1 = child_dict["children"][0]
        self.assertEqual(grandchild_dict_1["name"], "GrandchildObject1")
        grandchild_dict_2 = child_dict["children"][1]
        self.assertEqual(grandchild_dict_2["name"], "GrandchildObject2")

    def test_from_dict(self):
        test_dict = {
            "name": "TestObject",
            "position": [10, 20, 30],
            "quaternion": [0.70710678, 0, 0, 0.70710678],
            "scale": [1, 1, 1],
            "visible": True,
        }

        obj = Object3D._from_dict(test_dict)
        self.assertEqual(obj.name, "TestObject")
        self.assertEqual(obj.visible, True)
        np.testing.assert_almost_equal(
            obj.local_transform_matrix,
            np.array(
                [
                    [1, 0, 0, 10],
                    [0, 0, -1, 20],
                    [0, 1, 0, 30],
                    [0, 0, 0, 1],
                ]
            ),
            decimal=5,
        )
        np.testing.assert_equal(obj.position.to_arr(), np.array([10, 20, 30]))
        np.testing.assert_almost_equal(
            obj.rotation.to_arr(), np.array([1.5708, 0, 0]), decimal=5
        )
        np.testing.assert_equal(obj.scale.to_arr(), np.array([1, 1, 1]))


class TestObject3DBasics(unittest.TestCase):
    def test_position_init(self):
        self.assertRaises(ValueError, Object3D, "invalid", position=1)
        self.assertEqual(
            Object3D("astuple", position=(1, 2, 3)).position,
            Vector3(1.0, 2.0, 3.0),
        )
        self.assertEqual(
            Object3D("aslist", position=[1, 2, 3]).position,
            Vector3(1.0, 2.0, 3.0),
        )

    def test_position_setter(self):
        obj = Object3D("instance")
        self.assertRaises(ValueError, obj.__setattr__, "position", 1)

        obj.position = (1.0, 2.0, 3.0)
        self.assertEqual(
            obj.position,
            Vector3(1.0, 2.0, 3.0),
        )
        obj.position = [3.0, 2.0, 1]
        self.assertEqual(
            obj.position,
            Vector3(3.0, 2.0, 1.0),
        )

    def test_scale_init(self):
        self.assertEqual(
            Object3D("asfloat", scale=0.5).scale,
            Vector3(0.5, 0.5, 0.5),
        )
        self.assertEqual(
            Object3D("asint", scale=3).scale,
            Vector3(3, 3, 3),
        )
        self.assertEqual(
            Object3D("astuple", scale=(1, 2, 3)).scale,
            Vector3(1.0, 2.0, 3.0),
        )
        self.assertEqual(
            Object3D("aslist", scale=[1, 2, 3]).scale,
            Vector3(1.0, 2.0, 3.0),
        )

    def test_scale_setter(self):
        obj = Object3D("instance")

        obj.scale = 0.5
        self.assertEqual(
            obj.scale,
            Vector3(0.5, 0.5, 0.5),
        )
        obj.scale = 3
        self.assertEqual(
            obj.scale,
            Vector3(3, 3, 3),
        )

        obj.scale = (1.0, 2.0, 3.0)
        self.assertEqual(
            obj.scale,
            Vector3(1.0, 2.0, 3.0),
        )
        obj.scale = [3.0, 2.0, 1]
        self.assertEqual(
            obj.scale,
            Vector3(3.0, 2.0, 1.0),
        )

    def test_cant_add_self(self):
        obj = Object3D("looper")
        self.assertRaises(ValueError, obj.add, obj)

    def test_traverse(self):
        objects = [Object3D(f"object{i}") for i in range(5)]
        root = objects[0]
        sub = objects[1]
        sub.add(objects[2], objects[3])
        root.add(sub, objects[4])

        self.assertListEqual(list(root.traverse(include_self=True)), objects)
        self.assertListEqual(
            list(root.traverse(include_self=False)), objects[1:]
        )

        root.clear()
        self.assertListEqual(list(root.traverse(include_self=False)), [])
        self.assertListEqual(
            list(sub.traverse(include_self=False)), objects[2:4]
        )
