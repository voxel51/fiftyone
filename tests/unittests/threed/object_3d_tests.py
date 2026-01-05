"""
FiftyOne Object3D unit tests.

| Copyright 2017-2026, Voxel51, Inc.
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


class TestObject3DRemove(unittest.TestCase):
    def setUp(self):
        """Set up a scene graph for testing remove operations."""
        self.root = Object3D("root")
        self.child1 = Object3D("child1")
        self.child2 = Object3D("child2")
        self.child3 = Object3D("child3")
        self.grandchild1 = Object3D("grandchild1")
        self.grandchild2 = Object3D("grandchild2")
        self.grandchild3 = Object3D("grandchild3")
        self.great_grandchild = Object3D("great_grandchild")

        # Build hierarchy:
        # root
        #   - child1
        #     - grandchild1
        #       - great_grandchild
        #     - grandchild2
        #   - child2
        #   - child3
        #     - grandchild3
        self.child1.add(self.grandchild1, self.grandchild2)
        self.grandchild1.add(self.great_grandchild)
        self.child3.add(self.grandchild3)
        self.root.add(self.child1, self.child2, self.child3)

    def test_remove_by_reference_single_direct_child(self):
        """Test removing a single direct child by reference."""
        self.root.remove(self.child2)
        self.assertFalse(any(c is self.child2 for c in self.root.children))
        self.assertTrue(any(c is self.child1 for c in self.root.children))
        self.assertTrue(any(c is self.child3 for c in self.root.children))
        self.assertEqual(len(self.root.children), 2)

    def test_remove_by_reference_multiple_direct_children(self):
        """Test removing multiple direct children by reference."""
        self.root.remove(self.child1, self.child3)
        self.assertFalse(any(c is self.child1 for c in self.root.children))
        self.assertFalse(any(c is self.child3 for c in self.root.children))
        self.assertTrue(any(c is self.child2 for c in self.root.children))
        self.assertEqual(len(self.root.children), 1)

    def test_remove_by_reference_recursive_grandchild(self):
        """Test removing a grandchild recursively."""
        self.root.remove(self.grandchild1)
        self.assertFalse(
            any(c is self.grandchild1 for c in self.child1.children)
        )
        self.assertTrue(
            any(c is self.grandchild2 for c in self.child1.children)
        )
        self.assertEqual(len(self.child1.children), 1)

    def test_remove_by_reference_recursive_deep_nested(self):
        """Test removing a deeply nested node."""
        self.root.remove(self.great_grandchild)
        self.assertNotIn(self.great_grandchild, self.grandchild1.children)
        self.assertEqual(len(self.grandchild1.children), 0)

    def test_remove_by_reference_multiple_nested(self):
        """Test removing multiple nested nodes."""
        self.root.remove(self.grandchild1, self.grandchild3)
        self.assertFalse(
            any(c is self.grandchild1 for c in self.child1.children)
        )
        self.assertFalse(
            any(c is self.grandchild3 for c in self.child3.children)
        )
        self.assertTrue(
            any(c is self.grandchild2 for c in self.child1.children)
        )
        self.assertEqual(len(self.child1.children), 1)
        self.assertEqual(len(self.child3.children), 0)

    def test_remove_by_reference_cannot_remove_self(self):
        """Test that removing self raises ValueError."""
        with self.assertRaises(ValueError) as context:
            self.root.remove(self.root)
        self.assertIn("Cannot remove self", str(context.exception))

    def test_remove_by_reference_not_found(self):
        """Test that removing a non-existent object raises ValueError."""
        orphan = Object3D("orphan")
        with self.assertRaises(ValueError) as context:
            self.root.remove(orphan)
        self.assertIn("not found in scene graph", str(context.exception))

    def test_remove_by_reference_empty_args(self):
        """Test that remove with no arguments does nothing."""
        initial_children_count = len(self.root.children)
        self.root.remove()
        self.assertEqual(len(self.root.children), initial_children_count)

    def test_remove_by_name_single_match(self):
        """Test removing a single node by name."""
        self.root.remove_by_name("child2")
        self.assertFalse(any(c is self.child2 for c in self.root.children))
        self.assertTrue(any(c is self.child1 for c in self.root.children))
        self.assertTrue(any(c is self.child3 for c in self.root.children))

    def test_remove_by_name_multiple_matches(self):
        """Test removing multiple nodes with the same name."""
        duplicate = Object3D("child2")
        self.root.add(duplicate)

        self.root.remove_by_name("child2")
        self.assertFalse(any(c is self.child2 for c in self.root.children))
        self.assertFalse(any(c is duplicate for c in self.root.children))
        self.assertEqual(len(self.root.children), 2)

    def test_remove_by_name_recursive(self):
        """Test removing a nested node by name."""
        self.root.remove_by_name("grandchild1")
        self.assertFalse(
            any(c is self.grandchild1 for c in self.child1.children)
        )
        self.assertTrue(
            any(c is self.grandchild2 for c in self.child1.children)
        )

    def test_remove_by_name_deeply_nested(self):
        """Test removing a deeply nested node by name."""
        self.root.remove_by_name("great_grandchild")
        self.assertFalse(
            any(c is self.great_grandchild for c in self.grandchild1.children)
        )
        self.assertEqual(len(self.grandchild1.children), 0)

    def test_remove_by_name_cannot_remove_self(self):
        """Test that removing self by name raises ValueError."""
        with self.assertRaises(ValueError) as context:
            self.root.remove_by_name("root")
        self.assertIn("Cannot remove self", str(context.exception))

    def test_remove_by_name_not_found(self):
        """Test that removing a non-existent name raises ValueError."""
        with self.assertRaises(ValueError) as context:
            self.root.remove_by_name("nonexistent")
        self.assertIn("not found in scene graph", str(context.exception))

    def test_remove_by_uuid_single_match(self):
        """Test removing a node by UUID."""
        target_uuid = self.child2.uuid
        self.root.remove_by_uuid(target_uuid)
        self.assertFalse(any(c is self.child2 for c in self.root.children))
        self.assertTrue(any(c is self.child1 for c in self.root.children))
        self.assertTrue(any(c is self.child3 for c in self.root.children))

    def test_remove_by_uuid_recursive(self):
        """Test removing a nested node by UUID."""
        target_uuid = self.grandchild1.uuid
        self.root.remove_by_uuid(target_uuid)
        self.assertFalse(
            any(c is self.grandchild1 for c in self.child1.children)
        )
        self.assertTrue(
            any(c is self.grandchild2 for c in self.child1.children)
        )

    def test_remove_by_uuid_deeply_nested(self):
        """Test removing a deeply nested node by UUID."""
        target_uuid = self.great_grandchild.uuid
        self.root.remove_by_uuid(target_uuid)
        self.assertFalse(
            any(c is self.great_grandchild for c in self.grandchild1.children)
        )
        self.assertEqual(len(self.grandchild1.children), 0)

    def test_remove_by_uuid_cannot_remove_self(self):
        """Test that removing self by UUID raises ValueError."""
        root_uuid = self.root.uuid
        with self.assertRaises(ValueError) as context:
            self.root.remove_by_uuid(root_uuid)
        self.assertIn("Cannot remove self", str(context.exception))

    def test_remove_by_uuid_not_found(self):
        """Test that removing a non-existent UUID raises ValueError."""
        import uuid as uuid_module

        fake_uuid = str(uuid_module.uuid4())
        with self.assertRaises(ValueError) as context:
            self.root.remove_by_uuid(fake_uuid)
        self.assertIn("not found in scene graph", str(context.exception))

    def test_remove_preserves_other_nodes(self):
        """Test that removing one node doesn't affect others."""
        initial_grandchild2_children = len(self.grandchild2.children)
        initial_child3_children = len(self.child3.children)

        self.root.remove(self.grandchild1)

        # grandchild2 should still exist and have its children intact
        self.assertTrue(
            any(c is self.grandchild2 for c in self.child1.children)
        )
        self.assertEqual(
            len(self.grandchild2.children), initial_grandchild2_children
        )

        # child3 and its children should be unaffected
        self.assertTrue(any(c is self.child3 for c in self.root.children))
        self.assertEqual(len(self.child3.children), initial_child3_children)
        self.assertTrue(
            any(c is self.grandchild3 for c in self.child3.children)
        )

    def test_remove_all_children_then_add_back(self):
        """Test removing all children and then adding them back."""
        self.root.remove(self.child1, self.child2, self.child3)
        self.assertEqual(len(self.root.children), 0)

        # Add them back
        self.root.add(self.child1, self.child2, self.child3)
        self.assertEqual(len(self.root.children), 3)
        self.assertTrue(any(c is self.child1 for c in self.root.children))
        self.assertTrue(any(c is self.child2 for c in self.root.children))
        self.assertTrue(any(c is self.child3 for c in self.root.children))

    def test_remove_by_name_then_by_reference(self):
        """Test removing by name, then by reference."""
        self.root.remove_by_name("child2")
        self.assertFalse(any(c is self.child2 for c in self.root.children))

        self.root.remove(self.child1)
        self.assertFalse(any(c is self.child1 for c in self.root.children))
        self.assertEqual(len(self.root.children), 1)
        self.assertTrue(any(c is self.child3 for c in self.root.children))

    def test_remove_by_uuid_then_by_name(self):
        """Test removing by UUID, then by name."""
        self.root.remove_by_uuid(self.child2.uuid)
        self.assertFalse(any(c is self.child2 for c in self.root.children))

        self.root.remove_by_name("grandchild3")
        self.assertFalse(
            any(c is self.grandchild3 for c in self.child3.children)
        )
        self.assertEqual(len(self.child3.children), 0)

    def test_remove_ancestor_and_descendant_together(self):
        """Test removing an ancestor and one of its descendants in the same call."""
        initial_root_children_count = len(self.root.children)

        self.assertTrue(any(c is self.child1 for c in self.root.children))
        self.assertTrue(
            any(c is self.grandchild1 for c in self.child1.children)
        )

        self.root.remove(self.child1, self.grandchild1)

        self.assertFalse(any(c is self.child1 for c in self.root.children))
        self.assertEqual(
            len(self.root.children), initial_root_children_count - 1
        )

        all_nodes_under_root = list(self.root.traverse(include_self=False))
        self.assertNotIn(self.grandchild1, all_nodes_under_root)

        self.assertNotIn(self.grandchild2, all_nodes_under_root)

        self.assertTrue(any(c is self.child2 for c in self.root.children))
        self.assertTrue(any(c is self.child3 for c in self.root.children))


class TestObject3DFindAndExecute(unittest.TestCase):
    def setUp(self):
        """Set up a scene graph for testing find_and_execute operations."""
        self.root = Object3D("root")
        self.child1 = Object3D("child1")
        self.child2 = Object3D("child2")
        self.child3 = Object3D("child3")
        self.grandchild1 = Object3D("grandchild1")
        self.grandchild2 = Object3D("grandchild2")
        self.grandchild3 = Object3D("grandchild3")
        self.great_grandchild = Object3D("great_grandchild")

        # Build hierarchy:
        # root
        #   - child1
        #     - grandchild1
        #       - great_grandchild
        #     - grandchild2
        #   - child2
        #   - child3
        #     - grandchild3
        self.child1.add(self.grandchild1, self.grandchild2)
        self.grandchild1.add(self.great_grandchild)
        self.child3.add(self.grandchild3)
        self.root.add(self.child1, self.child2, self.child3)

    def test_find_and_collect_by_name(self):
        """Test finding and collecting nodes by name."""
        matches = []

        def predicate(child: Object3D) -> bool:
            return child.name == "grandchild1"

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(matches), 1)
        self.assertIs(matches[0], self.grandchild1)

    def test_find_and_collect_multiple_by_name(self):
        """Test finding and collecting multiple nodes with the same name."""
        # Add another node with the same name
        duplicate = Object3D("child2")
        self.root.add(duplicate)

        matches = []

        def predicate(child: Object3D) -> bool:
            return child.name == "child2"

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(matches), 2)
        self.assertIn(self.child2, matches)
        self.assertIn(duplicate, matches)

    def test_find_and_collect_by_uuid(self):
        """Test finding and collecting a node by UUID."""
        matches = []

        def predicate(child: Object3D) -> bool:
            return child.uuid == self.grandchild2.uuid

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(matches), 1)
        self.assertIs(matches[0], self.grandchild2)

    def test_find_and_collect_nested(self):
        """Test finding and collecting deeply nested nodes."""
        matches = []

        def predicate(child: Object3D) -> bool:
            return child.name == "great_grandchild"

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(matches), 1)
        self.assertIs(matches[0], self.great_grandchild)

    def test_find_and_execute_action(self):
        """Test finding nodes and executing an action on them."""
        updated_count = 0

        def predicate(child: Object3D) -> bool:
            return child.name.startswith("grandchild")

        def on_match(parent: Object3D, child: Object3D) -> bool:
            nonlocal updated_count
            child.visible = False
            updated_count += 1
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(updated_count, 3)
        self.assertFalse(self.grandchild1.visible)
        self.assertFalse(self.grandchild2.visible)
        self.assertFalse(self.grandchild3.visible)
        self.assertTrue(self.child1.visible)
        self.assertTrue(self.child2.visible)

    def test_stop_on_first_match(self):
        """Test stopping after first match is found."""
        matches = []

        def predicate(child: Object3D) -> bool:
            return child.name.startswith("child")

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return True

        self.root.find_and_execute(
            self.root, predicate, on_match, stop_on_first_match=True
        )

        self.assertEqual(len(matches), 1)
        self.assertIn(matches[0], [self.child1, self.child2, self.child3])

    def test_stop_on_first_match_with_callback_return_false(self):
        """Test stopping when callback returns False."""
        matches = []

        def predicate(child: Object3D) -> bool:
            return child.name.startswith("grandchild")

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return False

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(matches), 1)
        self.assertIn(
            matches[0], [self.grandchild1, self.grandchild2, self.grandchild3]
        )

    def test_find_all_children(self):
        """Test finding all direct children."""
        matches = []

        def predicate(child: Object3D) -> bool:
            return child in self.root.children

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(matches), 3)
        self.assertIn(self.child1, matches)
        self.assertIn(self.child2, matches)
        self.assertIn(self.child3, matches)

    def test_find_nothing(self):
        """Test finding when no nodes match the predicate."""
        matches = []

        def predicate(child: Object3D) -> bool:
            return child.name == "nonexistent"

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(matches), 0)

    def test_custom_predicate(self):
        """Test using a custom predicate function."""
        matches = []

        def predicate(child: Object3D) -> bool:
            return "grandchild" in child.name

        def on_match(parent: Object3D, child: Object3D) -> bool:
            matches.append(child)
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(matches), 4)
        self.assertIn(self.grandchild1, matches)
        self.assertIn(self.grandchild2, matches)
        self.assertIn(self.grandchild3, matches)
        self.assertIn(self.great_grandchild, matches)

    def test_find_and_collect_with_parent_info(self):
        """Test collecting both parent and child information."""
        parent_child_pairs = []

        def predicate(child: Object3D) -> bool:
            return child.name == "grandchild1"

        def on_match(parent: Object3D, child: Object3D) -> bool:
            parent_child_pairs.append((parent, child))
            return True

        self.root.find_and_execute(self.root, predicate, on_match)

        self.assertEqual(len(parent_child_pairs), 1)
        parent, child = parent_child_pairs[0]
        self.assertIs(parent, self.child1)
        self.assertIs(child, self.grandchild1)
