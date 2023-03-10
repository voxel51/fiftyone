"""
FiftyOne 3D utilities unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import tempfile
import unittest

import numpy as np
import open3d as o3d
from PIL import Image

import fiftyone as fo
import fiftyone.utils.utils3d as fou3d

from decorators import drop_datasets


def get_abs_path(relative_path):
    return os.path.join(os.path.dirname(__file__), relative_path)


class BaseOrthographicProjectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_pcd_path = os.path.join(self.temp_dir.name, "test_pcd.pcd")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def assertValidProjection(self, metadata_field, expected_image_path=None):
        self.assertTrue(os.path.exists(metadata_field.filepath))
        self.assertGreater(os.path.getsize(metadata_field.filepath), 0)

        if expected_image_path:
            expected_image = Image.open(expected_image_path)
            actual_image = Image.open(metadata_field.filepath)
            self.assertTrue(
                np.array_equal(
                    np.array(expected_image), np.array(actual_image)
                )
            )

    def write_test_pcd(self, num_points=10, pcd_type="rgb", seed=42):
        np.random.seed(seed)

        # lx, ly, lz
        dimensions = np.random.uniform(1, 3, size=3)
        # centroid: x, y, z
        location = np.random.uniform((-5, -5, 0), (5, 5, 0))
        # rx, ry, rz
        rotation = np.random.uniform(-np.pi, np.pi, size=3)

        points = np.random.uniform(
            -dimensions / 2, dimensions / 2, size=(num_points, 3)
        )

        # rotate points
        rotation_matrix = o3d.geometry.get_rotation_matrix_from_xyz(rotation)
        points = (
            points @ rotation_matrix.T
        )  # equivalent to (rotation_matrix @ points.T).T

        # translate points
        points = points + location[np.newaxis, :]

        pc = o3d.geometry.PointCloud()
        pc.points = o3d.utility.Vector3dVector(points)

        if pcd_type == "rgb" or pcd_type == "intensity":
            rgb = np.random.rand(points.shape[0], 3)
            pc.colors = o3d.utility.Vector3dVector(rgb)

        o3d.io.write_point_cloud(self.test_pcd_path, pc, write_ascii=True)


class OrthographicProjectionTests(BaseOrthographicProjectionTests):
    @drop_datasets
    def test_params_validation(self):
        dataset = fo.Dataset()

        non_group_samples = [fo.Sample(filepath="test.jpg")]
        dataset.add_samples(non_group_samples)

        # if media type is not group, usage of group params should throw an
        # error
        with self.assertRaisesRegex(ValueError, ".*media type.*"):
            fou3d.compute_orthographic_projection_images(
                dataset,
                size=(100, 100),
                in_group_slice="nonexistent_slice",
                output_dir=self.temp_dir.name,
            )

        with self.assertRaisesRegex(ValueError, ".*media type.*"):
            fou3d.compute_orthographic_projection_images(
                dataset,
                size=(100, 100),
                out_group_slice="nonexistent_slice",
                output_dir=self.temp_dir.name,
            )

        dataset = fo.Dataset()

        group = fo.Group()
        group_samples = [
            fo.Sample(
                filepath="image.jpg", group_field=group.element("image")
            ),
            fo.Sample(
                filepath=self.test_pcd_path, group_field=group.element("pcd")
            ),
        ]
        dataset.add_samples(group_samples)

        # if media type is group, in_group_slice should be valid, or omitted to
        # be implicitly derived

        # throws with wrong slice
        with self.assertRaisesRegex(ValueError, ".*media type.*"):
            fou3d.compute_orthographic_projection_images(
                dataset,
                size=(100, 100),
                in_group_slice="image",
                output_dir=self.temp_dir.name,
            )

        # throws with invalid slice
        with self.assertRaisesRegex(ValueError, ".*has no group slice.*"):
            fou3d.compute_orthographic_projection_images(
                dataset,
                size=(100, 100),
                in_group_slice="invalid_slice",
                output_dir=self.temp_dir.name,
            )

        # throws if both height and width are undefined
        with self.assertRaises(ValueError):
            fou3d.compute_orthographic_projection_images(
                dataset,
                size=(-1, -1),
                output_dir=self.temp_dir.name,
            )

    def test_group_projection(self):
        dataset = fo.Dataset()

        group = fo.Group()
        group_samples = [
            fo.Sample(
                filepath="image.jpg", group_field=group.element("image")
            ),
            fo.Sample(
                filepath=self.test_pcd_path, group_field=group.element("pcd")
            ),
        ]
        dataset.add_samples(group_samples)

        self.write_test_pcd(seed=42)
        fou3d.compute_orthographic_projection_images(
            dataset,
            size=(30, 30),
            output_dir=self.temp_dir.name,
            in_group_slice="pcd",
        )

        dataset.group_slice = "pcd"
        pcd_sample = dataset.first()
        self.assertTrue(
            pcd_sample.has_field("orthographic_projection_metadata")
        )
        self.assertValidProjection(
            pcd_sample["orthographic_projection_metadata"],
            get_abs_path("specs/3d/30x30_seed_42_none.png"),
        )

    @drop_datasets
    def test_rgb_projection(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath=self.test_pcd_path))

        self.write_test_pcd(num_points=1000, seed=1, pcd_type="rgb")
        fou3d.compute_orthographic_projection_images(
            dataset,
            size=(100, 100),
            output_dir=self.temp_dir.name,
        )
        self.assertTrue(
            dataset.first().has_field("orthographic_projection_metadata")
        )
        self.assertValidProjection(
            dataset.first()["orthographic_projection_metadata"],
            get_abs_path("specs/3d/100x100_seed_1_none.png"),
        )

        fou3d.compute_orthographic_projection_images(
            dataset,
            size=(50, 50),
            output_dir=self.temp_dir.name,
            shading_mode="rgb",
        )
        self.assertValidProjection(
            dataset.first()["orthographic_projection_metadata"],
            get_abs_path("specs/3d/50x50_seed_1_rgb.png"),
        )

    @drop_datasets
    def test_mono_projection(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath=self.test_pcd_path))

        self.write_test_pcd(num_points=1000, seed=10, pcd_type="mono")

        fou3d.compute_orthographic_projection_images(
            dataset,
            size=(-1, 100),
            output_dir=self.temp_dir.name,
        )
        self.assertTrue(
            dataset.first().has_field("orthographic_projection_metadata")
        )
        self.assertValidProjection(
            dataset.first()["orthographic_projection_metadata"],
            get_abs_path("specs/3d/100x100_seed_10_none.png"),
        )

        fou3d.compute_orthographic_projection_images(
            dataset,
            size=(100, -1),
            output_dir=self.temp_dir.name,
            shading_mode="height",
        )
        self.assertValidProjection(
            dataset.first()["orthographic_projection_metadata"],
            get_abs_path("specs/3d/100x100_seed_10_height.png"),
        )


class DataModelTests(unittest.TestCase):
    @drop_datasets
    def test_orthographic_projection_metadata_field(self):
        metadata = fou3d.OrthographicProjectionMetadata()
        metadata.filepath = "test_path"
        metadata.min_bound = (1, 2, 3)
        metadata.max_bound = (4, 5, 6)
        metadata.width = 100
        metadata.height = 100

        dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="some_path.png", orthographic_projection_metadata=metadata
        )
        dataset.add_sample(sample)
        dataset.save()

        field = dataset.first()["orthographic_projection_metadata"]
        self.assertEqual(
            field["filepath"],
            "test_path",
        )

        # tuples after deserialized are converted into np arrays
        self.assertTrue(np.array_equal(field["min_bound"], (1, 2, 3)))
        self.assertTrue(np.array_equal(field["max_bound"], (4, 5, 6)))
        self.assertEqual(field["width"], 100)
        self.assertEqual(field["height"], 100)


class HelperMethodTests(unittest.TestCase):
    def test_clamp_to_discrete(self):
        discrete = [0.111, 0.222, 0.333, 0.444, 0.555, 1.0]
        arr = np.array([0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])

        expected = np.array(
            [0.111, 0.111, 0.222, 0.333, 0.444, 0.555, 1.0, 1.0, 1.0, 1.0]
        )
        actual = fou3d._clamp_to_discrete(arr, discrete)
        self.assertTrue(np.array_equal(expected, actual))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
