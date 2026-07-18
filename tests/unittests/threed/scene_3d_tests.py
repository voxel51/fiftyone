"""
FiftyOne Scene3D unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os
import tempfile
import unittest
from unittest.mock import mock_open, patch

from fiftyone.core import threed
from fiftyone.core.threed.utils import convert_keys_to_snake_case

from .dataclass_test_utils import (
    assert_color_prop,
    assert_float_prop,
    assert_string_prop,
)


class TestScene(unittest.TestCase):
    def setUp(self):
        self.scene = threed.Scene()
        self.scene.add(threed.GltfMesh("gltf", gltf_path="/path/to/gltf.gltf"))
        self.scene.add(threed.GltfMesh("gltf2", gltf_path="relative.gltf"))
        self.scene.add(threed.PointCloud("pcd", pcd_path="/path/to/pcd.pcd"))
        self.scene.add(threed.Shape3D(name="shape"))
        self.scene.add(threed.StlMesh("stl", stl_path="/path/to/stl.stl"))
        self.scene.add(threed.PlyMesh("ply", ply_path="/path/to/ply.ply"))
        self.scene.add(
            threed.GaussianSplat("splat", splat_path="/path/to/splat.spz")
        )
        self.scene.add(threed.FbxMesh("fbx", fbx_path="/path/to/fbx.fbx"))
        self.scene.add(threed.ObjMesh("obj", obj_path="/path/to/obj.obj"))
        self.scene.background = threed.SceneBackground(
            image="../background.jpeg",
            cube=[
                "n1.jpeg",
                "n2.jpeg",
                "n3.jpeg",
                "n4.jpeg",
                "n5.jpeg",
                "n6.jpeg",
            ],
        )

    def test_export_invalid_extension(self):
        with self.assertRaises(ValueError):
            self.scene.write("/path/to/scene.invalid")

    def test_get_asset_paths(self):
        asset_paths = set(self.scene.get_asset_paths())
        self.assertSetEqual(
            asset_paths,
            {
                "/path/to/gltf.gltf",
                "/path/to/pcd.pcd",
                "../background.jpeg",
                "/path/to/stl.stl",
                "/path/to/fbx.fbx",
                "/path/to/ply.ply",
                "/path/to/splat.spz",
                "/path/to/obj.obj",
                "relative.gltf",
                "n1.jpeg",
                "n2.jpeg",
                "n3.jpeg",
                "n4.jpeg",
                "n5.jpeg",
                "n6.jpeg",
            },
        )

    def test_update_asset_paths(self):
        d = {
            "/path/to/pcd.pcd": "new.pcd",
            "/path/to/splat.spz": "new.spz",
            "../background.jpeg": "new_background.jpeg",
            "n3.jpeg": "new_n3.jpeg",
        }

        self.scene.update_asset_paths(d)

        asset_paths = set(self.scene.get_asset_paths())
        self.assertSetEqual(
            asset_paths,
            {
                "/path/to/gltf.gltf",
                "new.pcd",
                "new_background.jpeg",
                "/path/to/stl.stl",
                "/path/to/fbx.fbx",
                "/path/to/ply.ply",
                "new.spz",
                "/path/to/obj.obj",
                "relative.gltf",
                "n1.jpeg",
                "n2.jpeg",
                "new_n3.jpeg",
                "n4.jpeg",
                "n5.jpeg",
                "n6.jpeg",
            },
        )

    def test_write(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = os.path.join(temp_dir, "blah.fo3d")
            self.scene.write(path)
            scene2 = threed.Scene.from_fo3d(path)
            self.assertDictEqual(scene2.as_dict(), self.scene.as_dict())

    def test_write_resolve_relative(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = os.path.join(temp_dir, "blah.fo3d")
            self.scene.write(
                path,
                resolve_relative_paths=True,
            )
            scene2 = threed.Scene.from_fo3d(path)
            real_background = os.path.abspath(
                os.path.join(temp_dir, "../background.jpeg")
            )
            self.assertEqual(scene2.background.image, real_background)
            real_cubes = [
                os.path.abspath(os.path.join(temp_dir, ci))
                for ci in self.scene.background.cube
            ]
            self.assertListEqual(scene2.background.cube, real_cubes)
            for node in scene2.traverse():
                if node.name == "gltf2":
                    self.assertEqual(
                        node.gltf_path,
                        os.path.abspath(
                            os.path.join(temp_dir, "relative.gltf")
                        ),
                    )

    def test_get_scene_summary(self):
        summary = self.scene.get_scene_summary()
        self.assertDictEqual(
            summary,
            {
                "point clouds": 1,
                "gltfs": 2,
                "fbxs": 1,
                "plys": 1,
                "objs": 1,
                "shapes": 1,
                "stls": 1,
                "gaussian splats": 1,
            },
        )

    def test_gaussian_splat(self):
        splat = threed.GaussianSplat(
            "splat",
            splat_path="reconstruction.splat",
            format="splat",
            center_geometry=False,
        )

        self.assertDictEqual(
            splat.as_dict(),
            {
                "_type": "GaussianSplat",
                "uuid": splat.uuid,
                "name": "splat",
                "visible": True,
                "position": [0, 0, 0],
                "quaternion": [0, 0, 0, 1],
                "scale": [1.0, 1.0, 1.0],
                "children": [],
                "splatPath": "reconstruction.splat",
                "format": "splat",
                "centerGeometry": False,
            },
        )

        round_trip = threed.Object3D._from_dict(
            convert_keys_to_snake_case(splat.as_dict())
        )

        self.assertIsInstance(round_trip, threed.GaussianSplat)
        self.assertEqual(round_trip.splat_path, "reconstruction.splat")
        self.assertEqual(round_trip.format, "splat")
        self.assertFalse(round_trip.center_geometry)

    def test_gaussian_splat_invalid_extension(self):
        with self.assertRaises(ValueError):
            threed.GaussianSplat("bad", splat_path="/path/to/file.obj")

    def test_gaussian_splat_supported_modern_formats(self):
        rad = threed.GaussianSplat("lod", splat_path="/path/to/file.rad")
        sog_zip = threed.GaussianSplat(
            "sog", splat_path="/path/to/file.zip", format="sog"
        )
        opaque = threed.GaussianSplat(
            "opaque", splat_path="/media?filepath=/asset", format="spz"
        )

        self.assertEqual(rad.splat_path, "/path/to/file.rad")
        self.assertEqual(sog_zip.format, "sog")
        self.assertEqual(opaque.format, "spz")

    def test_gaussian_splat_rejects_invalid_format_hint(self):
        with self.assertRaises(ValueError):
            threed.GaussianSplat(
                "bad", splat_path="/path/to/file.spz", format="invalid"
            )

    def test_gaussian_splat_rejects_ambiguous_zip(self):
        with self.assertRaises(ValueError):
            threed.GaussianSplat("bad", splat_path="/path/to/file.zip")

        with self.assertRaises(ValueError):
            threed.GaussianSplat(
                "bad", splat_path="/path/to/file.zip", format="spz"
            )

    def test_from_fo3d(self):
        mock_file = mock_open(read_data=json.dumps(self.scene.as_dict()))

        with patch("builtins.open", mock_file):
            scene_from_file = threed.Scene.from_fo3d("/path/to/scene.fo3d")

        mock_file.assert_called_once_with("/path/to/scene.fo3d", "r")

        self.assertDictEqual(scene_from_file.as_dict(), self.scene.as_dict())

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


class TestSceneBackground(unittest.TestCase):
    def test_it(self):
        obj = threed.SceneBackground()
        self.assertEqual(obj, threed.SceneBackground(None, None, None, 1.0))
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_color_prop(self, obj, "color", nullable=True)
        assert_string_prop(self, obj, "image", nullable=True)
        assert_float_prop(self, obj, "intensity", nullable=True)

        # Custom cube tests
        self.assertRaises(ValueError, setattr, obj, "cube", 51.51)
        self.assertRaises(ValueError, setattr, obj, "cube", ["1", "2"])
        obj.cube = ["1", "2", "3", "4", "5", "6"]
        self.assertListEqual(obj.cube, ["1", "2", "3", "4", "5", "6"])

        obj2 = threed.SceneBackground._from_dict(obj.as_dict())
        self.assertEqual(obj, obj2)
