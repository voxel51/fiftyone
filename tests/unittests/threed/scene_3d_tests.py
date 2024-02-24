import json
import unittest
from unittest.mock import mock_open, patch

from fiftyone.core.threed import GLTFMesh, Pointcloud, Scene
from fiftyone.core.threed.utils import convert_keys_to_snake_case


class TestScene(unittest.TestCase):
    def setUp(self):
        self.scene = Scene()
        self.scene.add(GLTFMesh("gltf", gltf_path="/path/to/gltf.gltf"))
        self.scene.add(Pointcloud("pcd", pcd_path="/path/to/pcd.pcd"))

    def test_export_invalid_extension(self):
        with self.assertRaises(ValueError):
            self.scene.export("/path/to/scene.invalid")

    def test_from_fo3d(self):
        mock_file = mock_open(read_data=json.dumps(self.scene.as_dict()))

        with patch("builtins.open", mock_file):
            scene_from_file = Scene.from_fo3d("/path/to/scene.fo3d")

        mock_file.assert_called_once_with("/path/to/scene.fo3d", "r")

        self.assertEqual(scene_from_file.as_dict(), self.scene.as_dict())

    def test_snake_case_conversion(self):
        # test simple dict
        input_dict = {"camelCaseKey": "value", "anotherKey": "value"}
        expected_dict = {"camel_case_key": "value", "another_key": "value"}
        self.assertEqual(convert_keys_to_snake_case(input_dict), expected_dict)

        # test nested dict
        input_dict = {
            "camelCaseKey": {
                "nestedCamelCaseKey": "value",
                "anotherNestedKey": {"deeplyNestedKey": "deepValue"},
            },
            "anotherKey": "value",
        }
        expected_dict = {
            "camel_case_key": {
                "nested_camel_case_key": "value",
                "another_nested_key": {"deeply_nested_key": "deepValue"},
            },
            "another_key": "value",
        }
        self.assertEqual(convert_keys_to_snake_case(input_dict), expected_dict)

        # test with list
        input_dict = {
            "camelCaseKey": [
                {"listItemKey": "value"},
                {"anotherListItemKey": "value"},
            ],
            "anotherKey": "value",
        }
        expected_dict = {
            "camel_case_key": [
                {"list_item_key": "value"},
                {"another_list_item_key": "value"},
            ],
            "another_key": "value",
        }
        self.assertEqual(convert_keys_to_snake_case(input_dict), expected_dict)
