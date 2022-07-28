"""
FiftyOne group-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
import os
import random
import string

import eta.core.utils as etau

import fiftyone as fo
from fiftyone import ViewField as F

from decorators import drop_datasets


class GroupTests(unittest.TestCase):
    @drop_datasets
    def test_add_group_field(self):
        dataset = fo.Dataset()

        self.assertIsNone(dataset.media_type)
        self.assertIsNone(dataset.group_field)
        self.assertIsNone(dataset.default_group_slice)
        self.assertIsNone(dataset.group_slice)

        dataset.add_group_field("group_field", default="ego")

        self.assertEqual(dataset.media_type, "group")
        self.assertEqual(dataset.group_field, "group_field")
        self.assertEqual(dataset.default_group_slice, "ego")
        self.assertEqual(dataset.group_slice, "ego")
        self.assertDictEqual(dataset.group_media_types, {})

    @drop_datasets
    def test_add_implied_group_field(self):
        group = fo.Group()
        samples = [
            fo.Sample(
                filepath="left-image.jpg",
                group_field=group.element("left"),
            ),
            fo.Sample(
                filepath="ego-video.mp4",
                group_field=group.element("ego"),
            ),
            fo.Sample(
                filepath="right-image.jpg",
                group_field=group.element("right"),
            ),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        self.assertEqual(dataset.media_type, "group")
        self.assertEqual(dataset.group_field, "group_field")

        self.assertEqual(dataset.group_slice, "left")
        self.assertEqual(dataset.default_group_slice, "left")
        self.assertDictEqual(
            dataset.group_media_types,
            {"left": "image", "ego": "video", "right": "image"},
        )

    @drop_datasets
    def test_group_basics(self):
        dataset = _make_group_dataset()

        self.assertEqual(dataset.media_type, "group")
        self.assertEqual(dataset.group_slice, "ego")
        self.assertEqual(dataset.default_group_slice, "ego")
        self.assertIn("group_field", dataset.get_field_schema())
        self.assertEqual(len(dataset), 2)

        num_samples = 0
        for sample in dataset:
            num_samples += 1

        self.assertEqual(num_samples, 2)

        num_groups = 0
        for group in dataset.iter_groups():
            self.assertIsInstance(group, dict)
            self.assertIn("left", group)
            self.assertIn("ego", group)
            self.assertIn("right", group)
            num_groups += 1

        self.assertEqual(num_groups, 2)

        sample = dataset.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")

        group_id = sample.group_field.id
        group = dataset.get_group(group_id)

        self.assertIsInstance(group, dict)
        self.assertIn("left", group)
        self.assertIn("ego", group)
        self.assertIn("right", group)

    @drop_datasets
    def test_group_field_operations(self):
        dataset = _make_group_dataset()

        self.assertDictEqual(
            dataset.group_media_types,
            {"left": "image", "ego": "video", "right": "image"},
        )
        self.assertEqual(dataset.default_group_slice, "ego")

        dataset.default_group_slice = "left"
        self.assertEqual(dataset.default_group_slice, "left")

        # Datasets may only have one group field
        with self.assertRaises(ValueError):
            dataset.clone_sample_field("group_field", "group_field_copy")

        with self.assertRaises(ValueError):
            dataset.delete_sample_field("group_field")

        dataset.rename_sample_field("group_field", "still_group_field")
        self.assertEqual(dataset.group_field, "still_group_field")

        dataset.rename_sample_field("still_group_field", "group_field")

    @drop_datasets
    def test_group_views(self):
        dataset = _make_group_dataset()

        # Group fields cannot be excluded
        with self.assertRaises(ValueError):
            view = dataset.exclude_fields("group_field")

        view = dataset.select_fields()

        self.assertEqual(view.media_type, "group")
        self.assertEqual(view.group_slice, "ego")
        self.assertEqual(view.default_group_slice, "ego")
        self.assertIn("group_field", view.get_field_schema())
        self.assertEqual(len(view), 2)

        num_samples = 0
        for sample in view:
            num_samples += 1

        self.assertEqual(num_samples, 2)

        num_groups = 0
        for group in view.iter_groups():
            self.assertIsInstance(group, dict)
            self.assertIn("left", group)
            self.assertIn("ego", group)
            self.assertIn("right", group)
            num_groups += 1

        self.assertEqual(num_groups, 2)

        sample = view.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")

        group_id = sample.group_field.id
        group = view.get_group(group_id)

        self.assertIsInstance(group, dict)
        self.assertIn("left", group)
        self.assertIn("ego", group)
        self.assertIn("right", group)

        view = dataset.match(F("field") == 2)

        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().field, 2)

        view = dataset.match(F("groups.left.field") == 4)

        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().field, 5)

        view = dataset.select_group_slice("left")

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 2)

        sample = view.first()
        self.assertEqual(sample.group_field.name, "left")

        view = dataset.select_group_slice(["left", "right"])

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 4)

        self.assertListEqual(
            view.values("group_field.name"),
            ["left", "right", "left", "right"],
        )

        with self.assertRaises(ValueError):
            view = dataset.select_group_slice(["left", "ego"])

        with self.assertRaises(ValueError):
            view = dataset.select_group_slice()


class GroupExportTests(unittest.TestCase):
    def setUp(self):
        temp_dir = etau.TempDir()
        tmp_dir = temp_dir.__enter__()

        self._temp_dir = temp_dir
        self._tmp_dir = tmp_dir

    def tearDown(self):
        self._temp_dir.__exit__()

    def _new_name(self):
        return "".join(
            random.choice(string.ascii_lowercase + string.digits)
            for _ in range(24)
        )

    def _new_dir(self):
        return os.path.join(self._tmp_dir, self._new_name())

    @drop_datasets
    def test_export(self):
        dataset = _make_group_dataset()

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            export_media=False,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertEqual(len(dataset2), 2)


def _make_group_dataset():
    dataset = fo.Dataset()
    dataset.add_group_field("group_field", default="ego")

    group1 = fo.Group()
    group2 = fo.Group()

    samples = [
        fo.Sample(
            filepath="left-image1.jpg",
            group_field=group1.element("left"),
            field=1,
        ),
        fo.Sample(
            filepath="ego-video1.mp4",
            group_field=group1.element("ego"),
            field=2,
        ),
        fo.Sample(
            filepath="right-image1.jpg",
            group_field=group1.element("right"),
            field=3,
        ),
        fo.Sample(
            filepath="left-image2.jpg",
            group_field=group2.element("left"),
            field=4,
        ),
        fo.Sample(
            filepath="ego-video2.mp4",
            group_field=group2.element("ego"),
            field=5,
        ),
        fo.Sample(
            filepath="right-image2.jpg",
            group_field=group2.element("right"),
            field=6,
        ),
    ]

    dataset.add_samples(samples)
    return dataset


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
