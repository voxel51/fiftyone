"""
FiftyOne Material 3D unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.core.threed import material_3d

from fiftyone.core.threed.utils import convert_keys_to_snake_case

from dataclass_test_utils import (
    assert_bool_prop,
    assert_choice_prop,
    assert_color_prop,
    assert_float_prop,
)


class TestMaterial3D(unittest.TestCase):
    def test_material_3d(self):
        obj = material_3d.Material3D()
        self.assertEqual(
            obj,
            material_3d.Material3D(1.0),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_float_prop(self, obj, "opacity")

    def test_point_cloud_material(self):
        # PointCloudMaterial
        obj = material_3d.PointCloudMaterial()
        self.assertEqual(
            obj,
            material_3d.PointCloudMaterial(
                "height", "#ffffff", 1.0, False, opacity=1.0
            ),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_float_prop(self, obj, "opacity")
        assert_choice_prop(
            self,
            obj,
            "shading_mode",
            ["height", "intensity", "rgb", "custom"],
            nullable=False,
        )
        assert_color_prop(self, obj, "custom_color", False)
        assert_float_prop(self, obj, "point_size", False)
        assert_bool_prop(self, obj, "attenuate_by_distance", False)

        obj2 = material_3d.PointCloudMaterial._from_dict(
            convert_keys_to_snake_case(obj.as_dict())
        )
        self.assertEqual(obj, obj2)

    def test_mesh_material(self):
        obj = material_3d.MeshMaterial()
        self.assertEqual(
            obj,
            material_3d.MeshMaterial(False, opacity=1.0),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_bool_prop(self, obj, "wireframe", nullable=False)
        assert_float_prop(self, obj, "opacity", False)

    def test_basic_mesh_material(self):
        obj = material_3d.MeshBasicMaterial()
        self.assertEqual(
            obj,
            material_3d.MeshBasicMaterial(
                material_3d.COLOR_DEFAULT_GRAY, wireframe=False, opacity=1.0
            ),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_bool_prop(self, obj, "wireframe", nullable=False)
        assert_float_prop(self, obj, "opacity", False)
        assert_color_prop(self, obj, "color", False)

        obj2 = material_3d.MeshBasicMaterial._from_dict(
            convert_keys_to_snake_case(obj.as_dict())
        )
        self.assertEqual(obj, obj2)

    def test_standard_mesh_material(self):
        obj = material_3d.MeshStandardMaterial()
        self.assertEqual(
            obj,
            material_3d.MeshStandardMaterial(
                material_3d.COLOR_DEFAULT_GRAY,
                material_3d.COLOR_DEFAULT_BLACK,
                0.0,
                0.0,
                1.0,
                wireframe=False,
                opacity=1.0,
            ),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_color_prop(self, obj, "color", False)
        assert_color_prop(self, obj, "emissive_color", False)
        assert_float_prop(self, obj, "emissive_intensity", False)
        assert_float_prop(self, obj, "metalness", False)
        assert_float_prop(self, obj, "roughness", False)
        assert_float_prop(self, obj, "opacity", False)
        assert_bool_prop(self, obj, "wireframe", False)

        obj2 = material_3d.MeshStandardMaterial._from_dict(
            convert_keys_to_snake_case(obj.as_dict())
        )
        self.assertEqual(obj, obj2)

    def test_lambert_mesh_material(self):
        obj = material_3d.MeshLambertMaterial()
        self.assertEqual(
            obj,
            material_3d.MeshLambertMaterial(
                material_3d.COLOR_DEFAULT_GRAY,
                material_3d.COLOR_DEFAULT_BLACK,
                0.0,
                1.0,
                0.98,
                wireframe=False,
                opacity=1.0,
            ),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_color_prop(self, obj, "color", False)
        assert_color_prop(self, obj, "emissive_color", False)
        assert_float_prop(self, obj, "emissive_intensity", False)
        assert_float_prop(self, obj, "reflectivity", False)
        assert_float_prop(self, obj, "refraction_ratio", False)
        assert_float_prop(self, obj, "opacity", False)
        assert_bool_prop(self, obj, "wireframe", False)

        obj.reflectivity = 0.51
        obj2 = material_3d.MeshLambertMaterial._from_dict(
            convert_keys_to_snake_case(obj.as_dict())
        )
        self.assertEqual(obj, obj2)

    def test_phong_mesh_material(self):
        obj = material_3d.MeshPhongMaterial()
        self.assertEqual(
            obj,
            material_3d.MeshPhongMaterial(
                30.0,
                material_3d.COLOR_DEFAULT_DARK_GRAY,
                color=material_3d.COLOR_DEFAULT_GRAY,
                emissive_color=material_3d.COLOR_DEFAULT_BLACK,
                emissive_intensity=0.0,
                reflectivity=1.0,
                refraction_ratio=0.98,
                wireframe=False,
                opacity=1.0,
            ),
        )
        self.assertRaises(ValueError, setattr, obj, "another_field", 51)

        assert_float_prop(self, obj, "shininess", False)
        assert_color_prop(self, obj, "specular_color", False)
        assert_color_prop(self, obj, "color", False)
        assert_color_prop(self, obj, "emissive_color", False)
        assert_float_prop(self, obj, "emissive_intensity", False)
        assert_float_prop(self, obj, "reflectivity", False)
        assert_float_prop(self, obj, "refraction_ratio", False)
        assert_float_prop(self, obj, "opacity", False)
        assert_bool_prop(self, obj, "wireframe", False)

        obj.reflectivity = 0.51
        obj.shininess = 51.51
        obj2 = material_3d.MeshLambertMaterial._from_dict(
            convert_keys_to_snake_case(obj.as_dict())
        )
        self.assertEqual(obj, obj2)
