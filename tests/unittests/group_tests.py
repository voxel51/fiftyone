"""
FiftyOne group-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from itertools import groupby
import json
import os
import random
import string
import unittest

from bson import ObjectId

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.utils.data as foud
import fiftyone.utils.groups as foug
import fiftyone.core.media as fom
import fiftyone.core.metadata as fome
from fiftyone import ViewExpression as E, ViewField as F

from decorators import drop_datasets
from utils.groups import make_disjoint_groups_dataset


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
    def test_group_dataset_frames_init(self):
        conn = foo.get_db_conn()

        dataset = fo.Dataset()
        dataset.media_type = "group"

        self.assertIsNone(dataset._frame_collection)
        self.assertIsNone(dataset._frame_collection_name)
        self.assertTrue(len(dataset._doc.frame_fields) == 0)

        dataset.add_group_slice("pcd", "point-cloud")

        self.assertIsNone(dataset._frame_collection)
        self.assertIsNone(dataset._frame_collection_name)
        self.assertTrue(len(dataset._doc.frame_fields) == 0)

        dataset.add_group_slice("camera", "video")

        self.assertIsNotNone(dataset._frame_collection)
        self.assertIsNotNone(dataset._frame_collection_name)
        self.assertTrue(len(dataset._doc.frame_fields) > 0)

        collections = conn.list_collection_names()
        self.assertIn(dataset._frame_collection_name, collections)

        dataset = fo.Dataset()
        group = fo.Group()

        dataset.add_samples(
            [
                fo.Sample(
                    filepath="left-image.jpg",
                    group_field=group.element("left"),
                ),
                fo.Sample(
                    filepath="right-image.jpg",
                    group_field=group.element("right"),
                ),
            ]
        )

        self.assertIsNone(dataset._frame_collection)
        self.assertIsNone(dataset._frame_collection_name)
        self.assertTrue(len(dataset._doc.frame_fields) == 0)

        dataset.add_sample(
            fo.Sample(
                filepath="ego-video.mp4",
                group_field=group.element("ego"),
            )
        )

        self.assertIsNotNone(dataset._frame_collection)
        self.assertIsNotNone(dataset._frame_collection_name)
        self.assertTrue(len(dataset._doc.frame_fields) > 0)

        collections = conn.list_collection_names()
        self.assertIn(dataset._frame_collection_name, collections)

    @drop_datasets
    def test_group_dataset_merge_frames_init(self):
        group = fo.Group()
        sample = fo.Sample(
            filepath="video.mp4",
            sample_key="vid",
            group=group.element("vid"),
        )

        dataset1 = fo.Dataset()
        dataset1.add_group_field("group")
        dataset1.add_sample_field("sample_key", fo.StringField)

        dataset1.merge_samples([sample], key_field="sample_key")

        self.assertEqual(dataset1.media_type, "group")
        self.assertEqual(dataset1.group_field, "group")
        self.assertDictEqual(dataset1.group_media_types, {"vid": "video"})
        self.assertIsNotNone(dataset1._frame_collection)
        self.assertIsNotNone(dataset1._frame_collection_name)
        self.assertEqual(len(dataset1), 1)

        dataset2 = fo.Dataset()
        dataset2.add_group_field("group")
        dataset2.add_sample_field("sample_key", fo.StringField)

        dataset2.merge_samples([sample], key_fcn=lambda s: s["sample_key"])

        self.assertEqual(dataset2.media_type, "group")
        self.assertEqual(dataset2.group_field, "group")
        self.assertDictEqual(dataset2.group_media_types, {"vid": "video"})
        self.assertIsNotNone(dataset2._frame_collection)
        self.assertIsNotNone(dataset2._frame_collection_name)
        self.assertEqual(len(dataset2), 1)

    @drop_datasets
    def test_basics(self):
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

        for group in dataset.iter_groups(group_slices="right"):
            self.assertIsInstance(group, dict)
            self.assertNotIn("left", group)
            self.assertNotIn("ego", group)
            self.assertIn("right", group)

        for group in dataset.iter_groups(group_slices=["left", "right"]):
            self.assertIsInstance(group, dict)
            self.assertIn("left", group)
            self.assertNotIn("ego", group)
            self.assertIn("right", group)

        for group in dataset.iter_groups(autosave=True):
            for sample in group.values():
                sample["new_field"] = 1

        self.assertEqual(
            len(
                dataset.select_group_slices(_allow_mixed=True).exists(
                    "new_field"
                )
            ),
            6,
        )

        sample = dataset.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")
        self.assertEqual(sample.new_field, 1)

        group_id = sample.group_field.id

        group = dataset.get_group(group_id)

        self.assertIsInstance(group, dict)
        self.assertIn("left", group)
        self.assertIn("ego", group)
        self.assertIn("right", group)

        group = dataset.get_group(group_id, group_slices="right")

        self.assertIsInstance(group, dict)
        self.assertNotIn("left", group)
        self.assertNotIn("ego", group)
        self.assertIn("right", group)

        group = dataset.get_group(group_id, group_slices=["left", "right"])

        self.assertIsInstance(group, dict)
        self.assertIn("left", group)
        self.assertNotIn("ego", group)
        self.assertIn("right", group)

    @drop_datasets
    def test_one_fo3d_group_slice(self):
        dataset = fo.Dataset()

        group = fo.Group()
        one = fo.Sample(filepath="one.fo3d", group=group.element("one"))
        two = fo.Sample(filepath="two.fo3d", group=group.element("two"))

        with self.assertRaises(ValueError):
            dataset.add_samples([one, two])

        dataset = fo.Dataset()
        dataset.add_sample(one)

        with self.assertRaises(ValueError):
            dataset.add_group_slice("two", "3d")

    @drop_datasets
    def test_field_operations(self):
        dataset = _make_group_dataset()

        self.assertSetEqual(
            set(dataset.group_slices),
            {"left", "right", "ego"},
        )
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
    def test_delete_samples(self):
        dataset = _make_group_dataset()

        view = dataset.select_group_slices(_allow_mixed=True)
        self.assertEqual(len(view), 6)

        sample = view.shuffle(seed=51).first()

        dataset.delete_samples(sample.id)
        self.assertEqual(len(view), 5)

        dataset.delete_groups(sample.group_field.id)
        self.assertEqual(len(view), 3)

        group = next(iter(dataset.iter_groups()))

        dataset.delete_groups(group)

        self.assertEqual(len(view), 0)

    @drop_datasets
    def test_keep(self):
        dataset = _make_group_dataset()

        view = dataset.select_group_slices(_allow_mixed=True)
        self.assertEqual(len(view), 6)

        dataset.limit(1).keep()

        self.assertEqual(len(view), 3)

        dataset.select_group_slices("ego").keep()
        sample = view.first()

        self.assertEqual(len(view), 1)
        self.assertEqual(sample.group_field.name, "ego")

        dataset.clear()

        self.assertEqual(len(view), 0)

    @drop_datasets
    def test_slice_operations(self):
        dataset = _make_group_dataset()

        self.assertSetEqual(
            set(dataset.group_slices),
            {"left", "right", "ego"},
        )
        self.assertEqual(dataset.default_group_slice, "ego")
        self.assertEqual(dataset.group_slice, "ego")

        dataset.rename_group_slice("ego", "still_ego")

        self.assertSetEqual(
            set(dataset.group_slices),
            {"left", "right", "still_ego"},
        )
        self.assertEqual(dataset.default_group_slice, "still_ego")
        self.assertEqual(dataset.group_slice, "still_ego")
        self.assertEqual(
            len(dataset.select_group_slices(_allow_mixed=True)), 6
        )

        sample = dataset.first()
        self.assertEqual(sample.group_field.name, "still_ego")

        dataset.delete_group_slice("still_ego")

        self.assertSetEqual(set(dataset.group_slices), {"left", "right"})
        self.assertIn(dataset.default_group_slice, ["left", "right"])
        self.assertEqual(dataset.group_slice, dataset.default_group_slice)
        self.assertEqual(len(dataset.select_group_slices()), 4)

        dataset.delete_group_slice("left")

        self.assertSetEqual(set(dataset.group_slices), {"right"})
        self.assertEqual(dataset.default_group_slice, "right")
        self.assertEqual(dataset.group_slice, "right")
        self.assertEqual(len(dataset.select_group_slices()), 2)

        dataset.delete_group_slice("right")

        self.assertEqual(dataset.group_slices, [])
        self.assertIsNone(dataset.default_group_slice)
        self.assertIsNone(dataset.group_slice)
        self.assertEqual(len(dataset.select_group_slices()), 0)

        group = fo.Group()
        sample = fo.Sample(
            filepath="ego-video.mp4",
            group_field=group.element("ego"),
        )

        dataset.add_sample(sample)

        self.assertEqual(dataset.group_slices, ["ego"])
        self.assertEqual(dataset.default_group_slice, "ego")
        self.assertEqual(dataset.group_slice, "ego")
        self.assertEqual(len(dataset.select_group_slices()), 1)

    @drop_datasets
    def test_views(self):
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

        for group in view.iter_groups(group_slices="right"):
            self.assertIsInstance(group, dict)
            self.assertNotIn("left", group)
            self.assertNotIn("ego", group)
            self.assertIn("right", group)

        for group in view.iter_groups(group_slices=["left", "right"]):
            self.assertIsInstance(group, dict)
            self.assertIn("left", group)
            self.assertNotIn("ego", group)
            self.assertIn("right", group)

        for group in view.iter_groups(autosave=True):
            for sample in group.values():
                sample["new_field"] = 1

        self.assertEqual(
            len(
                dataset.select_group_slices(_allow_mixed=True).exists(
                    "new_field"
                )
            ),
            6,
        )

        sample = view.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")

        group_ids_to_keep = dataset.take(2).values("group_field.id")
        keep_view = dataset.select_groups(group_ids_to_keep)
        self.assertEqual(len(keep_view), 2)

        group_ids_to_exclude = dataset.take(2).values("group_field.id")
        exclude_view = dataset.exclude_groups(group_ids_to_exclude)
        self.assertEqual(len(exclude_view), len(dataset) - 2)

        group_id = sample.group_field.id

        group = view.get_group(group_id)

        self.assertIsInstance(group, dict)
        self.assertIn("left", group)
        self.assertIn("ego", group)
        self.assertIn("right", group)

        group = view.get_group(group_id, group_slices="right")

        self.assertIsInstance(group, dict)
        self.assertNotIn("left", group)
        self.assertNotIn("ego", group)
        self.assertIn("right", group)

        group = view.get_group(group_id, group_slices=["left", "right"])

        self.assertIsInstance(group, dict)
        self.assertIn("left", group)
        self.assertNotIn("ego", group)
        self.assertIn("right", group)

        view = dataset.match(F("field") == 2)

        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().field, 2)

        view = dataset.match(F("groups.left.field") == 4)

        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().field, 5)

        view = dataset.select_group_slices("left")

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 2)

        sample = view.first()
        self.assertEqual(sample.group_field.name, "left")

        view = dataset.select_group_slices(["left", "right"])

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 4)

        self.assertListEqual(
            view.values("group_field.name"),
            ["left", "right", "left", "right"],
        )

        with self.assertRaises(ValueError):
            view = dataset.select_group_slices(["left", "ego"])

        with self.assertRaises(ValueError):
            view = dataset.select_group_slices()

        view = dataset.select_fields()
        sample = view.first()

        self.assertEqual(view.group_slice, "ego")
        self.assertEqual(sample.group_field.name, "ego")

        view.group_slice = "left"
        sample = view.first()

        self.assertEqual(view.group_slice, "left")
        self.assertEqual(sample.group_field.name, "left")

        with self.assertRaises(ValueError):
            view.group_slice = "foo-bar"

        view2 = view.limit(1)
        sample2 = view2.first()

        self.assertEqual(view2.group_slice, "left")
        self.assertEqual(sample2.group_field.name, "left")

        view.group_slice = None
        sample = view.first()

        self.assertEqual(view.group_slice, "ego")
        self.assertEqual(sample.group_field.name, "ego")

    @drop_datasets
    def test_field_schemas(self):
        dataset = _make_group_dataset()

        self.assertEqual(dataset.media_type, "group")
        self.assertIn("field", dataset.get_field_schema())
        self.assertIn("field", dataset.get_frame_field_schema())

        grouped_view = dataset.limit(1)

        self.assertEqual(grouped_view.media_type, "group")
        self.assertIn("field", grouped_view.get_field_schema())
        self.assertIn("field", grouped_view.get_frame_field_schema())

        image_view = dataset.select_group_slices(media_type="image")

        self.assertEqual(image_view.media_type, "image")
        self.assertIn("field", image_view.get_field_schema())
        self.assertIn("group_field", image_view.get_field_schema())
        self.assertIsNone(image_view.get_frame_field_schema())

        view = image_view.select_fields()

        self.assertNotIn("group_field", view.get_field_schema())

        mixed_view = dataset.select_group_slices(_allow_mixed=True)

        self.assertEqual(mixed_view.media_type, "mixed")
        self.assertIn("field", mixed_view.get_field_schema())
        self.assertIn("field", mixed_view.get_frame_field_schema())

        view = dataset.select_fields()

        # Selecting active slice maintains schema changes
        video_view = view.select_group_slices("ego")

        self.assertEqual(view.group_slice, "ego")
        self.assertEqual(video_view.media_type, "video")
        self.assertNotIn("field", video_view.get_field_schema())
        self.assertNotIn("field", video_view.get_frame_field_schema())
        for sample in video_view:
            self.assertFalse(sample.has_field("field"))
            for frame in sample.frames.values():
                self.assertFalse(frame.has_field("field"))

        # Cloning a grouped dataset maintains schema changes
        group_dataset = view.clone()

        self.assertNotIn("field", group_dataset.get_field_schema())
        self.assertNotIn("field", group_dataset.get_frame_field_schema())
        for sample in group_dataset:
            self.assertFalse(sample.has_field("field"))
            for frame in sample.frames.values():
                self.assertFalse(frame.has_field("field"))

        # Selecting group slices maintains schema changes
        image_view = view.select_group_slices(media_type="image")

        self.assertNotIn("field", image_view.get_field_schema())
        for sample in image_view:
            self.assertFalse(sample.has_field("field"))

        image_dataset = image_view.clone()

        self.assertNotIn("field", image_dataset.get_field_schema())
        for sample in image_dataset:
            self.assertFalse(sample.has_field("field"))

        # Selecting group slices maintains frame schema changes
        video_view = view.select_group_slices(media_type="video")

        self.assertNotIn("field", video_view.get_field_schema())
        self.assertNotIn("field", video_view.get_frame_field_schema())
        for sample in video_view:
            self.assertFalse(sample.has_field("field"))
            for frame in sample.frames.values():
                self.assertFalse(frame.has_field("field"))

        video_dataset = video_view.clone()

        self.assertNotIn("field", video_dataset.get_field_schema())
        self.assertNotIn("field", video_dataset.get_frame_field_schema())
        for sample in video_dataset:
            self.assertFalse(sample.has_field("field"))
            for frame in sample.frames.values():
                self.assertFalse(frame.has_field("field"))

    @drop_datasets
    def test_select_exclude_slices(self):
        dataset = _make_group_dataset()

        # Select slices by name
        view = dataset.select_group_slices(["left", "right"], flat=False)

        self.assertEqual(len(view), 2)
        self.assertEqual(view.media_type, "group")
        self.assertSetEqual(set(view.group_slices), {"left", "right"})
        self.assertDictEqual(
            view.group_media_types, {"left": "image", "right": "image"}
        )
        self.assertIn(view.group_slice, ["left", "right"])
        self.assertIn(view.default_group_slice, ["left", "right"])

        # Select slices by media type
        view = dataset.select_group_slices(media_type="image", flat=False)

        self.assertEqual(len(view), 2)
        self.assertEqual(view.media_type, "group")
        self.assertSetEqual(set(view.group_slices), {"left", "right"})
        self.assertDictEqual(
            view.group_media_types, {"left": "image", "right": "image"}
        )
        self.assertIn(view.group_slice, ["left", "right"])
        self.assertIn(view.default_group_slice, ["left", "right"])

        # Exclude slices by name
        view = dataset.exclude_group_slices("ego")

        self.assertEqual(len(view), 2)
        self.assertEqual(view.media_type, "group")
        self.assertSetEqual(set(view.group_slices), {"left", "right"})
        self.assertDictEqual(
            view.group_media_types, {"left": "image", "right": "image"}
        )
        self.assertIn(view.group_slice, ["left", "right"])
        self.assertIn(view.default_group_slice, ["left", "right"])

        # Exclude slices by media type
        view = dataset.exclude_group_slices(media_type="video")

        self.assertEqual(len(view), 2)
        self.assertEqual(view.media_type, "group")
        self.assertSetEqual(set(view.group_slices), {"left", "right"})
        self.assertDictEqual(
            view.group_media_types, {"left": "image", "right": "image"}
        )
        self.assertIn(view.group_slice, ["left", "right"])
        self.assertIn(view.default_group_slice, ["left", "right"])

        # Empty grouped view
        view = dataset.select_group_slices(
            ["left", "right"], flat=False
        ).exclude_group_slices(media_type="image")

        self.assertEqual(len(view), 0)
        self.assertEqual(view.media_type, "group")
        self.assertListEqual(view.group_slices, [])
        self.assertDictEqual(view.group_media_types, {})
        self.assertIsNone(view.group_slice)
        self.assertIsNone(view.default_group_slice)

        # Empty grouped view clone
        dataset2 = view.clone()

        self.assertEqual(len(dataset2), 0)
        self.assertEqual(dataset2.media_type, "group")
        self.assertListEqual(dataset2.group_slices, [])
        self.assertDictEqual(dataset2.group_media_types, {})
        self.assertIsNone(dataset2.group_slice)
        self.assertIsNone(dataset2.default_group_slice)

        # Select group slices with filtered schema
        view = dataset.select_fields().select_group_slices(
            media_type="video", flat=False
        )

        self.assertEqual(len(view), 2)
        self.assertEqual(view.media_type, "group")
        self.assertListEqual(view.group_slices, ["ego"])
        self.assertDictEqual(view.group_media_types, {"ego": "video"})
        self.assertEqual(view.group_slice, "ego")
        self.assertEqual(view.default_group_slice, "ego")

        schema = view.get_field_schema()
        frame_schema = view.get_frame_field_schema()

        self.assertNotIn("field", schema)
        self.assertNotIn("field", frame_schema)

        sample_view = view.first()
        frame_view = sample_view.frames.first()

        self.assertFalse(sample_view.has_field("field"))
        self.assertFalse(frame_view.has_field("field"))

        # Clone selected group slices with filtered schema
        dataset2 = view.clone()

        self.assertEqual(len(dataset2), 2)
        self.assertEqual(dataset2.media_type, "group")
        self.assertListEqual(dataset2.group_slices, ["ego"])
        self.assertDictEqual(dataset2.group_media_types, {"ego": "video"})
        self.assertEqual(dataset2.group_slice, "ego")
        self.assertEqual(dataset2.default_group_slice, "ego")

        schema = dataset2.get_field_schema()
        frame_schema = dataset2.get_frame_field_schema()

        self.assertNotIn("field", schema)
        self.assertNotIn("field", frame_schema)

        sample2 = dataset2.first()
        frame2 = sample2.frames.first()

        self.assertFalse(sample2.has_field("field"))
        self.assertFalse(frame2.has_field("field"))

    @drop_datasets
    def test_attached_groups(self):
        dataset = _make_group_dataset()

        detections = [
            fo.Detections(detections=[fo.Detection(label="left")]),
            fo.Detections(detections=[fo.Detection(label="ego")]),
            fo.Detections(detections=[fo.Detection(label="right")]),
            fo.Detections(detections=[fo.Detection(label="LEFT")]),
            fo.Detections(detections=[fo.Detection(label="EGO")]),
            fo.Detections(detections=[fo.Detection(label="RIGHT")]),
        ]

        view = dataset.select_group_slices(_allow_mixed=True)
        view.set_values("ground_truth", detections)

        dataset.group_slice = "left"
        self.assertListEqual(
            dataset.values("ground_truth.detections.label", unwind=True),
            ["left", "LEFT"],
        )

        dataset.group_slice = "right"
        self.assertListEqual(
            dataset.values("ground_truth.detections.label", unwind=True),
            ["right", "RIGHT"],
        )

        dataset.group_slice = "ego"
        self.assertListEqual(
            dataset.values("ground_truth.detections.label", unwind=True),
            ["ego", "EGO"],
        )

        field = dataset.get_field("field")
        self.assertIsInstance(field, fo.IntField)

        field = dataset.get_field("groups.left.field")
        self.assertIsInstance(field, fo.IntField)

        field = dataset.get_field("ground_truth.detections.label")
        self.assertIsInstance(field, fo.StringField)

        field = dataset.get_field("groups.right.ground_truth.detections.label")
        self.assertIsInstance(field, fo.StringField)

        # Verifies that `groups.left.ground_truth` is correctly recognized as a
        # Detections field
        view = dataset.filter_labels(
            "groups.left.ground_truth",
            F("label") == F("label").upper(),
        )

        self.assertEqual(len(view), 1)

    @drop_datasets
    def test_stats(self):
        dataset = _make_group_dataset()

        stats = dataset.stats()

        self.assertEqual(stats["samples_count"], 6)
        self.assertNotIn("media_bytes", stats)

        stats = dataset.stats(include_media=True)

        self.assertEqual(stats["samples_count"], 6)
        self.assertIn("media_bytes", stats)

        view = dataset.limit(1).select_fields()

        stats = view.stats()

        self.assertEqual(stats["samples_count"], 3)
        self.assertNotIn("media_bytes", stats)

        stats = view.stats(include_media=True)

        self.assertEqual(stats["samples_count"], 3)
        self.assertIn("media_bytes", stats)

    @drop_datasets
    def test_aggregations(self):
        dataset = _make_group_dataset()

        self.assertEqual(dataset.count(), 2)
        self.assertEqual(dataset.count("frames"), 2)

        self.assertListEqual(dataset.distinct("field"), [2, 5])
        self.assertListEqual(
            dataset.select_group_slices(["left", "right"]).distinct("field"),
            [1, 3, 4, 6],
        )
        self.assertListEqual(
            dataset.select_group_slices(_allow_mixed=True).distinct("field"),
            [1, 2, 3, 4, 5, 6],
        )
        self.assertListEqual(dataset.distinct("frames.field"), [1, 2])

        view = dataset.limit(1)

        self.assertEqual(view.count(), 1)
        self.assertEqual(view.count("frames"), 2)

        self.assertListEqual(view.distinct("field"), [2])
        self.assertListEqual(
            view.select_group_slices(["left", "right"]).distinct("field"),
            [1, 3],
        )
        self.assertListEqual(
            view.select_group_slices(_allow_mixed=True).distinct("field"),
            [1, 2, 3],
        )
        self.assertListEqual(view.distinct("frames.field"), [1, 2])

        view = dataset.limit(1).select_group_slices("ego")

        self.assertEqual(view.count(), 1)
        self.assertEqual(view.count("frames"), 2)

        self.assertListEqual(view.distinct("field"), [2])
        self.assertListEqual(view.distinct("frames.field"), [1, 2])

    @drop_datasets
    def test_set_values(self):
        dataset = _make_group_dataset()

        dataset.set_values("new_field", [3, 4])

        self.assertListEqual(dataset.values("new_field"), [3, 4])
        self.assertListEqual(
            dataset.select_group_slices("left").values("new_field"),
            [None, None],
        )

        sample = dataset.first()

        self.assertEqual(sample.new_field, 3)

        sample = dataset.select_group_slices("left").first()

        self.assertIsNone(sample.new_field)

        view = dataset.select_group_slices(["left", "right"])

        view.set_values("new_field", [10, 20, 30, 40])

        self.assertListEqual(
            dataset.select_group_slices(_allow_mixed=True).values("new_field"),
            [10, 3, 20, 30, 4, 40],
        )

        sample = dataset.select_group_slices("left").first()

        self.assertEqual(sample.new_field, 10)

        view = dataset.limit(1)

        view.set_values("frames.new_field", [[3, 4]])

        self.assertListEqual(dataset.values("new_field"), [3, 4])

        self.assertListEqual(
            dataset.limit(1).values("frames.new_field", unwind=True), [3, 4]
        )

        sample = dataset.first()
        frame = sample.frames.first()

        self.assertEqual(frame.new_field, 3)

    @drop_datasets
    def test_to_dict(self):
        dataset = _make_group_dataset()

        d = dataset.to_dict()

        dataset2 = fo.Dataset.from_dict(d)

        self.assertEqual(dataset2.media_type, "group")
        self.assertEqual(dataset2.group_slice, "ego")
        self.assertEqual(dataset2.default_group_slice, "ego")
        self.assertIn("group_field", dataset2.get_field_schema())
        self.assertEqual(len(dataset2), 2)

        sample = dataset2.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")
        self.assertEqual(len(sample.frames), 0)

        d = dataset.to_dict(include_frames=True)

        dataset3 = fo.Dataset.from_dict(d)

        self.assertEqual(dataset3.media_type, "group")
        self.assertEqual(dataset3.group_slice, "ego")
        self.assertEqual(dataset3.default_group_slice, "ego")
        self.assertIn("group_field", dataset3.get_field_schema())
        self.assertEqual(len(dataset3), 2)
        self.assertEqual(dataset3.count("frames"), 2)

        sample = dataset3.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")
        self.assertEqual(len(sample.frames), 2)

        frame = sample.frames.first()

        self.assertEqual(frame.field, 1)

    @drop_datasets
    def test_clone(self):
        dataset = _make_group_dataset()

        dataset2 = dataset.clone()

        self.assertEqual(dataset2.media_type, "group")
        self.assertEqual(dataset2.group_slice, "ego")
        self.assertEqual(dataset2.default_group_slice, "ego")
        self.assertEqual(len(dataset2), 2)
        self.assertEqual(dataset2.count("frames"), 2)
        self.assertEqual(
            len(dataset2.select_group_slices(_allow_mixed=True)),
            6,
        )

        sample = dataset2.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")
        self.assertEqual(len(sample.frames), 2)

        frame = sample.frames.first()

        self.assertEqual(frame.field, 1)

        view = dataset.limit(1)

        dataset3 = view.clone()

        self.assertEqual(dataset3.media_type, "group")
        self.assertEqual(dataset3.group_slice, "ego")
        self.assertEqual(dataset3.default_group_slice, "ego")
        self.assertEqual(len(dataset3), 1)
        self.assertEqual(dataset3.count("frames"), 2)
        self.assertEqual(
            len(dataset3.select_group_slices(_allow_mixed=True)),
            3,
        )

        sample = dataset3.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")
        self.assertEqual(len(sample.frames), 2)

        frame = sample.frames.first()

        self.assertEqual(frame.field, 1)

        view = dataset.select_group_slices("ego")

        dataset4 = view.clone()

        self.assertEqual(dataset4.media_type, "video")
        self.assertIsNone(dataset4.group_slice)
        self.assertIsNone(dataset4.default_group_slice)
        self.assertEqual(len(dataset4), 2)
        self.assertEqual(dataset4.count("frames"), 2)

        sample = dataset4.first()

        self.assertEqual(sample.media_type, "video")
        self.assertEqual(len(sample.frames), 2)

        frame = sample.frames.first()

        self.assertEqual(frame.field, 1)

        view = dataset.select_group_slices(_allow_mixed=True)

        self.assertEqual(view.media_type, "mixed")
        with self.assertRaises(ValueError):
            _ = view.clone()

    def test_merge_groups1(self):
        dataset = _make_group_dataset()

        dataset1 = dataset[:1].clone()

        new_dataset = fo.Dataset()
        new_dataset.add_collection(dataset1)

        self.assertEqual(len(new_dataset), 1)
        self.assertEqual(
            len(new_dataset.select_group_slices(_allow_mixed=True)), 3
        )
        self.assertEqual(new_dataset.media_type, "group")
        self.assertEqual(new_dataset.default_group_slice, "ego")
        self.assertEqual(new_dataset.group_slice, "ego")

        new_dataset.add_collection(dataset[1:2])

        self.assertEqual(len(new_dataset), 2)
        self.assertEqual(
            len(new_dataset.select_group_slices(_allow_mixed=True)), 6
        )
        self.assertEqual(new_dataset.media_type, "group")
        self.assertEqual(new_dataset.default_group_slice, "ego")
        self.assertEqual(new_dataset.group_slice, "ego")

        new_dataset.add_collection(dataset.limit(0))

        self.assertEqual(len(new_dataset), 2)
        self.assertEqual(
            len(new_dataset.select_group_slices(_allow_mixed=True)), 6
        )
        self.assertEqual(new_dataset.media_type, "group")
        self.assertEqual(new_dataset.default_group_slice, "ego")
        self.assertEqual(new_dataset.group_slice, "ego")

    @drop_datasets
    def test_merge_groups2(self):
        dataset = _make_group_dataset()

        new_dataset = fo.Dataset()
        new_dataset.media_type = "group"

        slice1 = dataset.limit(1).select_group_slices("left")
        new_dataset.add_collection(slice1)

        self.assertEqual(len(new_dataset), 1)
        self.assertEqual(
            len(new_dataset.select_group_slices(_allow_mixed=True)), 1
        )
        self.assertEqual(new_dataset.media_type, "group")
        self.assertEqual(new_dataset.default_group_slice, "left")
        self.assertEqual(new_dataset.group_slice, "left")
        self.assertDictEqual(new_dataset.group_media_types, {"left": "image"})

        slice2 = dataset.limit(1).select_group_slices(
            ["right", "ego"], _allow_mixed=True
        )
        new_dataset.add_collection(slice2)

        self.assertEqual(len(new_dataset), 1)
        self.assertEqual(
            len(new_dataset.select_group_slices(_allow_mixed=True)), 3
        )
        self.assertEqual(new_dataset.media_type, "group")
        self.assertEqual(new_dataset.default_group_slice, "left")
        self.assertEqual(new_dataset.group_slice, "left")
        self.assertDictEqual(
            new_dataset.group_media_types, dataset.group_media_types
        )

        slice3 = dataset.skip(1).select_group_slices(_allow_mixed=True)
        new_dataset.add_collection(slice3)

        self.assertEqual(len(new_dataset), 2)
        self.assertEqual(
            len(new_dataset.select_group_slices(_allow_mixed=True)), 6
        )
        self.assertEqual(new_dataset.media_type, "group")
        self.assertEqual(new_dataset.default_group_slice, "left")
        self.assertEqual(new_dataset.group_slice, "left")

    @drop_datasets
    def test_merge_groups3(self):
        dataset = _make_group_dataset()

        new_dataset = fo.Dataset()

        slice1 = dataset.select_group_slices("left")
        new_dataset.add_collection(slice1)

        self.assertEqual(len(new_dataset), 2)
        self.assertEqual(new_dataset.media_type, "image")
        self.assertIsNone(new_dataset._doc.group_field)
        self.assertIsNone(new_dataset._doc.default_group_slice)
        self.assertEqual(new_dataset._doc.group_media_types, {})

        # Cannot merge videos into image collection
        with self.assertRaises(ValueError):
            slice2 = dataset.select_group_slices("ego")
            new_dataset.add_collection(slice2)

    @drop_datasets
    def test_merge_groups4(self):
        dataset = _make_group_dataset()

        new_dataset = dataset.clone()

        new_dataset.delete_group_slice("left")
        new_dataset.rename_group_slice("ego", "left")

        # 'left' slice has wrong type
        with self.assertRaises(ValueError):
            new_dataset.add_collection(dataset)

        # 'left' slice still has wrong type
        with self.assertRaises(ValueError):
            new_dataset.add_collection(dataset.select_group_slices("left"))

        new_dataset.add_collection(
            dataset.select_group_slices("right"), new_ids=True
        )

        self.assertEqual(new_dataset.group_slice, "left")
        self.assertEqual(len(new_dataset), 2)

        new_dataset.group_slice = "right"
        self.assertEqual(len(new_dataset), 4)

    @drop_datasets
    def test_merge_groups5(self):
        dataset = _make_group_dataset()

        dataset.add_collection(dataset, new_ids=True)
        samples = dataset.select_group_slices(_allow_mixed=True)

        self.assertEqual(len(dataset), 4)
        self.assertEqual(dataset.media_type, "group")
        self.assertEqual(dataset.group_slice, "ego")

        self.assertEqual(len(samples), 12)
        self.assertEqual(len(set(samples.values("id"))), 12)
        self.assertEqual(len(set(samples.values("group_field.id"))), 4)

        self.assertEqual(dataset.count("frames"), 4)
        self.assertEqual(len(set(samples.values("frames.id", unwind=True))), 4)

    @drop_datasets
    def test_merge_groups6(self):
        dataset = _make_group_dataset()

        view = dataset.select_group_slices(_allow_mixed=True)
        samples = list(view)

        self.assertEqual(len(dataset), 2)
        self.assertEqual(dataset.count("frames"), 2)
        self.assertEqual(len(view), 6)

        key_fcn = lambda sample: sample.filepath
        dataset.merge_samples(samples, key_fcn=key_fcn)

        view = dataset.select_group_slices(_allow_mixed=True)

        self.assertEqual(len(dataset), 2)
        self.assertEqual(dataset.count("frames"), 2)
        self.assertEqual(len(view), 6)

    @drop_datasets
    def test_indexes(self):
        dataset = _make_group_dataset()

        dataset2 = dataset.clone()
        indexes2 = dataset2.list_indexes()

        self.assertEqual(dataset2.media_type, "group")
        self.assertIn("group_field.id", indexes2)
        self.assertIn("group_field.name", indexes2)
        self.assertIn("frames.id", indexes2)

        dataset3 = dataset.select_fields().clone()
        indexes3 = dataset3.list_indexes()

        self.assertEqual(dataset3.media_type, "group")
        self.assertIn("group_field.id", indexes3)
        self.assertIn("group_field.name", indexes3)
        self.assertIn("frames.id", indexes3)

        dataset4 = fo.Dataset()
        dataset4.merge_samples(dataset)
        indexes4 = dataset4.list_indexes()

        self.assertEqual(dataset4.media_type, "group")
        self.assertIn("group_field.id", indexes4)
        self.assertIn("group_field.name", indexes4)
        self.assertIn("frames.id", indexes4)

        dataset5 = fo.Dataset()
        dataset5.merge_samples([dataset.first()])
        indexes5 = dataset5.list_indexes()

        self.assertEqual(dataset5.media_type, "group")
        self.assertIn("group_field.id", indexes5)
        self.assertIn("group_field.name", indexes5)
        self.assertIn("frames.id", indexes5)

        dataset6 = fo.Dataset()
        dataset6.merge_sample(dataset.first())
        indexes6 = dataset6.list_indexes()

        self.assertEqual(dataset6.media_type, "group")
        self.assertIn("group_field.id", indexes6)
        self.assertIn("group_field.name", indexes6)
        self.assertIn("frames.id", indexes6)

    @drop_datasets
    def test_set_values_group(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image1.jpg"),
                fo.Sample(filepath="image2.jpg"),
                fo.Sample(filepath="image3.jpg"),
            ]
        )

        groups = [
            fo.Group().element("left"),
            fo.Group().element("right"),
            fo.Group().element("right"),
        ]

        dataset.set_values("group", groups)

        self.assertEqual(dataset.media_type, "group")
        self.assertIsNotNone(dataset.group_slice)
        self.assertIsNotNone(dataset.default_group_slice)
        self.assertDictEqual(
            dataset.group_media_types, {"left": "image", "right": "image"}
        )

    @drop_datasets
    def test_delete_group_field(self):
        dataset1 = _make_group_dataset()

        # Deleting group field from dataset with >1 media types is not allowed
        with self.assertRaises(ValueError):
            dataset1.delete_sample_fields("group_field")

        dataset2 = fo.Dataset()
        dataset2.add_group_field("group_field")
        dataset2.add_collection(
            dataset1.select_group_slices(media_type="image")
        )

        self.assertEqual(dataset2.media_type, "group")
        self.assertIsNotNone(dataset2.group_slice)
        self.assertIsNotNone(dataset2.default_group_slice)
        self.assertDictEqual(
            dataset2.group_media_types, {"left": "image", "right": "image"}
        )

        # Deleting group field from dataset with one media type is allowed
        dataset2.delete_sample_field("group_field")

        self.assertEqual(dataset2.media_type, "image")
        self.assertIsNone(dataset2.group_slice)
        self.assertIsNone(dataset2.default_group_slice)
        self.assertIsNone(dataset2.group_media_types)

    @drop_datasets
    def test_group_collections(self):
        dataset1 = fo.Dataset()
        dataset1.add_samples(
            [
                fo.Sample(filepath="image-left1.jpg", group_id=1),
                fo.Sample(filepath="image-left2.jpg", group_id=2),
                fo.Sample(filepath="image-left3.jpg", group_id=3),
                fo.Sample(filepath="skip-me1.jpg"),
            ]
        )

        dataset2 = fo.Dataset()
        dataset2.add_samples(
            [
                fo.Sample(filepath="image-right1.jpg", group_id=1),
                fo.Sample(filepath="image-right2.jpg", group_id=2),
                fo.Sample(filepath="image-right4.jpg", group_id=4),
                fo.Sample(filepath="skip-me2.jpg"),
            ]
        )

        dataset = foug.group_collections(
            {"left": dataset1, "right": dataset2}, "group_id"
        )

        self.assertEqual(len(dataset), 3)
        self.assertEqual(dataset.media_type, "group")
        self.assertIsNotNone(dataset.group_slice)
        self.assertIsNotNone(dataset.default_group_slice)
        self.assertDictEqual(
            dataset.group_media_types, {"left": "image", "right": "image"}
        )

        view = dataset.select_group_slices()

        self.assertEqual(len(view), 6)
        self.assertEqual(view.media_type, "image")

    @drop_datasets
    def test_concurrent_group_slice_updates(self):
        dataset = fo.Dataset()
        group = fo.Group()
        slice1 = "slice1"
        dataset.add_sample(fo.Sample("blah.jpg", group=group.element(slice1)))

        # Don't reuse singleton; we want to test concurrent edits here
        dataset._instances.pop(dataset.name)
        also_dataset = fo.load_dataset(dataset.name)
        self.assertIsNot(dataset, also_dataset)

        # Test rename group slice safety
        also_dataset.add_group_slice("slice2", fo.core.media.IMAGE)
        dataset.rename_group_slice("slice1", "also-slice1")
        dataset.reload()
        self.assertDictEqual(
            dataset.group_media_types,
            {
                "slice2": fo.core.media.IMAGE,
                "also-slice1": fo.core.media.IMAGE,
            },
        )

        # Test delete group slice safety
        also_dataset.reload()
        also_dataset.add_group_slice("slice3", fo.core.media.IMAGE)
        dataset.delete_group_slice("also-slice1")

        also_dataset.reload()
        self.assertDictEqual(
            also_dataset.group_media_types,
            {"slice2": fo.core.media.IMAGE, "slice3": fo.core.media.IMAGE},
        )

        # Test default group slice safety with delete
        dataset.reload()
        dataset.default_group_slice = "slice3"
        dataset.save()
        also_dataset.reload()

        dataset.rename_group_slice("slice2", "slice2-1")
        also_dataset.delete_group_slice("slice3")
        dataset.reload()
        self.assertDictEqual(
            dataset.group_media_types,
            {"slice2-1": fo.core.media.IMAGE},
        )
        self.assertEqual(dataset.default_group_slice, "slice2-1")

        # Test default group slice safety with rename
        dataset.add_group_slice("slice3", fo.core.media.IMAGE)
        also_dataset.reload()
        also_dataset.default_group_slice = "slice3"
        also_dataset.save()
        dataset.rename_group_slice("slice3", "slice3-1")
        dataset.reload()
        self.assertDictEqual(
            dataset.group_media_types,
            {"slice2-1": fo.core.media.IMAGE, "slice3-1": fo.core.media.IMAGE},
        )
        self.assertEqual(dataset.default_group_slice, "slice3-1")


class GroupImportExportTests(unittest.TestCase):
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
    def test_fiftyone_dataset(self):
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

        self.assertEqual(dataset2.media_type, "group")
        self.assertEqual(dataset2.group_slice, "ego")
        self.assertEqual(dataset2.default_group_slice, "ego")
        self.assertIn("group_field", dataset2.get_field_schema())
        self.assertIn("field", dataset2.get_frame_field_schema())
        self.assertEqual(len(dataset2), 2)

        sample = dataset.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")
        self.assertEqual(len(sample.frames), 2)

        group_id = sample.group_field.id
        group = dataset.get_group(group_id)

        self.assertIsInstance(group, dict)
        self.assertIn("left", group)
        self.assertIn("ego", group)
        self.assertIn("right", group)

    @drop_datasets
    def test_legacy_fiftyone_dataset(self):
        dataset = _make_group_dataset()

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
            export_media=False,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        # LegacyFiftyOneDataset doesn't know how to load this info...
        dataset2.default_group_slice = "ego"
        dataset2.group_slice = "ego"

        self.assertEqual(dataset2.media_type, "group")
        self.assertEqual(dataset2.group_slice, "ego")
        self.assertEqual(dataset2.default_group_slice, "ego")
        self.assertIn("group_field", dataset2.get_field_schema())
        self.assertIn("field", dataset2.get_frame_field_schema())
        self.assertEqual(len(dataset2), 2)

        sample = dataset.first()

        self.assertEqual(sample.group_field.name, "ego")
        self.assertEqual(sample.media_type, "video")
        self.assertEqual(len(sample.frames), 2)

        group_id = sample.group_field.id
        group = dataset.get_group(group_id)

        self.assertIsInstance(group, dict)
        self.assertIn("left", group)
        self.assertIn("ego", group)
        self.assertIn("right", group)

    @drop_datasets
    def test_group_import_export(self):
        dataset = _make_group_dataset()

        export_path = os.path.join(self._new_dir(), "filepaths.json")

        exporter = _GroupExporter(export_path)
        dataset.export(dataset_exporter=exporter)

        importer = _GroupImporter(export_path)
        dataset2 = fo.Dataset.from_importer(importer)

        flat_view = dataset.select_group_slices(_allow_mixed=True)
        flat_view2 = dataset2.select_group_slices(_allow_mixed=True)

        self.assertEqual(dataset2.media_type, "group")
        self.assertEqual(set(dataset.group_slices), set(dataset2.group_slices))
        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(len(flat_view), len(flat_view2))
        self.assertEqual(
            set(flat_view.values("filepath")),
            set(flat_view2.values("filepath")),
        )

    @drop_datasets
    def test_fiftyone_dataset_group_indexes(self):
        dataset = _make_group_dataset()

        group_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "frames.id",
            "frames.created_at",
            "frames.last_modified_at",
            "frames._sample_id_1_frame_number_1",
            "group_field.id",
            "group_field.name",
        }

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

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(set(dataset.list_indexes()), group_indexes)
        self.assertSetEqual(set(dataset2.list_indexes()), group_indexes)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
            export_media=False,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(set(dataset.list_indexes()), group_indexes)
        self.assertSetEqual(set(dataset2.list_indexes()), group_indexes)

    @drop_datasets
    def test_disjoint_groups(self):
        dataset, first, second = make_disjoint_groups_dataset()

        view = dataset.select_groups(first.group.id)
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().id, first.id)

        view = view.select_group_slices("first")
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().id, first.id)

        dataset.group_slice = "second"
        view = dataset.select_groups(second.group.id)
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().id, second.id)

        view = view.select_group_slices("second")
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().id, second.id)

        dataset.group_slice = None
        view = dataset.view()
        view.group_slice = "second"
        view = view.select_groups(second.group.id)
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().id, second.id)

        view = view.select_group_slices("second")
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().id, second.id)

    @drop_datasets
    def test_dynamic_groups(self):
        dataset = _make_group_dataset()

        for slice in dataset.group_slices:
            dataset.group_slice = slice
            view = dataset.group_by("filepath")
            self.assertEqual(
                view.default_group_slice, dataset.default_group_slice
            )
            self.assertEqual(view.group_field, dataset.group_field)
            self.assertDictEqual(
                view.group_media_types, dataset.group_media_types
            )
            self.assertEqual(view.group_slice, slice)
            self.assertListEqual(view.group_slices, dataset.group_slices)

            view = dataset.select_group_slices(slice)
            self.assertIsNone(view.default_group_slice)
            self.assertIsNone(view.group_field)
            self.assertIsNone(view.group_media_types)
            self.assertIsNone(view.group_slice)
            self.assertIsNone(view.group_slices)
            self.assertEqual(view._parent_media_type, fom.GROUP)

            view = view.group_by("filepath")
            self.assertIsNone(view.default_group_slice)
            self.assertIsNone(view.group_field)
            self.assertIsNone(view.group_media_types)
            self.assertIsNone(view.group_slice)
            self.assertIsNone(view.group_slices)
            self.assertEqual(
                view._parent_media_type, dataset.group_media_types[slice]
            )


class _GroupImporter(foud.GroupDatasetImporter):
    """Example grouped dataset importer.

    Args:
        filepaths: can be either a list of dicts mapping slice names to
            filepaths, or the path to a JSON file on disk containing this list
            under a top-level key of any name
    """

    def __init__(self, filepaths):
        self.filepaths = filepaths

        self._filepaths = None
        self._iter_filepaths = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filepaths = iter(self._filepaths)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        filepaths = next(self._iter_filepaths)
        return {
            name: fo.Sample(filepath=filepath)
            for name, filepath in filepaths.items()
        }

    @property
    def has_sample_field_schema(self):
        return False

    @property
    def has_dataset_info(self):
        return False

    @property
    def group_field(self):
        return "group"

    def setup(self):
        if isinstance(self.filepaths, str):
            with open(self.filepaths, "r") as f:
                filepaths = json.load(f)

            self._filepaths = next(iter(filepaths.values()), [])
        else:
            self._filepaths = self.filepaths

        self._num_samples = sum(len(f) for f in self._filepaths)


class _GroupExporter(foud.GroupDatasetExporter):
    """Example grouped dataset exporter.

    Args:
        export_path: the path to write a JSON file containing the filepaths of
            the grouped collection
    """

    def __init__(self, export_path):
        self.export_path = export_path
        self._filepaths = None

    def export_group(self, group):
        self._filepaths.append(
            {name: sample.filepath for name, sample in group.items()}
        )

    def setup(self):
        self._filepaths = []

    def close(self, *args):
        os.makedirs(os.path.dirname(self.export_path), exist_ok=True)
        with open(self.export_path, "w") as f:
            json.dump({"filepaths": self._filepaths}, f)


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

    sample = dataset.first()
    sample.frames[1] = fo.Frame(field=1)
    sample.frames[2] = fo.Frame(field=2)
    sample.save()

    return dataset


class DynamicGroupTests(unittest.TestCase):
    @drop_datasets
    def test_group_by(self):
        dataset = _make_group_by_dataset()

        default_indexes = {"id", "filepath", "created_at", "last_modified_at"}

        sample_id1, sample_id2 = dataset.limit(2).values("sample_id")
        counts = dataset.count_values("sample_id")

        view1 = dataset.group_by("sample_id")
        self.assertEqual(view1.media_type, "group")
        self.assertIsNone(view1.group_field)
        self.assertIsNone(view1.group_slice)
        self.assertIsNone(view1.group_slices)
        self.assertIsNone(view1.default_group_slice)
        self.assertIsNone(view1.group_media_types)
        self.assertTrue(view1._is_dynamic_groups)
        self.assertEqual(len(view1), 2)
        self.assertSetEqual(
            set(dataset.list_indexes()),
            default_indexes | {"sample_id"},
        )

        sample = view1.first()
        group_id = sample.sample_id
        group = view1.get_dynamic_group(group_id)
        sample_ids = [g.sample_id for g in group]

        self.assertIsInstance(group, fo.DatasetView)
        self.assertEqual(len(group), counts[group_id])
        self.assertEqual(len(set(sample_ids)), 1)

        group = next(view1.iter_dynamic_groups())
        group_id = group.first().sample_id
        sample_ids = [g.sample_id for g in group]

        self.assertIsInstance(group, fo.DatasetView)
        self.assertEqual(len(group), counts[group_id])
        self.assertEqual(len(set(sample_ids)), 1)

        view2 = view1.sort_by("filepath", reverse=True).limit(1)

        self.assertEqual(view2.media_type, "group")
        self.assertTrue(view2._is_dynamic_groups)
        self.assertEqual(len(view2), 1)

        sample = view2.first()
        group_id = sample.sample_id
        group = view2.get_dynamic_group(group_id)
        also_group = next(view2.iter_dynamic_groups())
        sample_ids = view2.values("sample_id")
        frame_numbers = [s.frame_number for s in group]
        also_frame_numbers = [s.frame_number for s in also_group]

        self.assertEqual(sample.sample_id, sample_id2)
        self.assertEqual(sample.frame_number, 2)
        self.assertIsInstance(group, fo.DatasetView)
        self.assertIsInstance(also_group, fo.DatasetView)
        self.assertListEqual(sample_ids, [sample_id2])
        self.assertListEqual(frame_numbers, [2, 1])
        self.assertListEqual(also_frame_numbers, [2, 1])

    @drop_datasets
    def test_group_by_ordered(self):
        dataset = _make_group_by_dataset()
        sample_id1, sample_id2 = dataset.limit(2).values("sample_id")
        counts = dataset.count_values("sample_id")

        view1 = dataset.group_by(
            "sample_id", order_by="frame_number", reverse=True
        )

        self.assertEqual(view1.media_type, "group")
        self.assertIsNone(view1.group_field)
        self.assertIsNone(view1.group_slice)
        self.assertIsNone(view1.group_slices)
        self.assertIsNone(view1.default_group_slice)
        self.assertIsNone(view1.group_media_types)
        self.assertTrue(view1._is_dynamic_groups)
        self.assertEqual(len(view1), 2)
        self.assertSetEqual(
            set(dataset.list_indexes()),
            {
                "id",
                "filepath",
                "created_at",
                "last_modified_at",
                "_sample_id_1_frame_number_-1",
            },
        )

        sample = view1.first()
        group_id = sample.sample_id
        group = view1.get_dynamic_group(group_id)
        sample_ids = [g.sample_id for g in group]

        self.assertIsInstance(group, fo.DatasetView)
        self.assertEqual(len(group), counts[group_id])
        self.assertEqual(len(set(sample_ids)), 1)

        group = next(view1.iter_dynamic_groups())
        group_id = group.first().sample_id
        sample_ids = [g.sample_id for g in group]

        self.assertIsInstance(group, fo.DatasetView)
        self.assertEqual(len(group), counts[group_id])
        self.assertEqual(len(set(sample_ids)), 1)

        view2 = view1.sort_by("filepath", reverse=True).limit(1)

        self.assertEqual(view2.media_type, "group")
        self.assertTrue(view2._is_dynamic_groups)
        self.assertEqual(len(view2), 1)

        sample = view2.first()
        group_id = sample.sample_id
        group = view2.get_dynamic_group(group_id)
        also_group = next(view2.iter_dynamic_groups())
        sample_ids = view2.values("sample_id")
        frame_numbers = [s.frame_number for s in group]
        also_frame_numbers = [s.frame_number for s in also_group]

        self.assertEqual(sample.sample_id, sample_id2)
        self.assertEqual(sample.frame_number, 2)
        self.assertIsInstance(group, fo.DatasetView)
        self.assertIsInstance(also_group, fo.DatasetView)
        self.assertListEqual(sample_ids, [sample_id2])
        self.assertListEqual(frame_numbers, [2, 1])
        self.assertListEqual(also_frame_numbers, [2, 1])

    @drop_datasets
    def test_group_by_compound(self):
        sample_id1 = ObjectId()
        sample_id2 = ObjectId()

        samples = [
            fo.Sample(
                filepath="frame1.jpg",
                sample_id=sample_id1,
                device_id=1,
            ),
            fo.Sample(
                filepath="frame2.jpg",
                sample_id=sample_id1,
                device_id=1,
            ),
            fo.Sample(
                filepath="frame3.jpg",
                sample_id=sample_id1,
                device_id=2,
            ),
            fo.Sample(
                filepath="frame4.jpg",
                sample_id=sample_id2,
                device_id=3,
            ),
            fo.Sample(
                filepath="frame5.jpg",
                sample_id=sample_id2,
                device_id=4,
            ),
            fo.Sample(
                filepath="frame6.jpg",
                sample_id=sample_id2,
                device_id=4,
            ),
        ]

        dataset = fo.Dataset()
        dataset.add_sample_field("sample_id", fo.ObjectIdField)
        dataset.add_samples(samples)

        default_indexes = {"id", "filepath", "created_at", "last_modified_at"}

        view = dataset.group_by(("sample_id", "device_id"))

        self.assertEqual(len(view), 4)
        self.assertSetEqual(
            set(dataset.list_indexes()),
            default_indexes | {"_sample_id_1_device_id_1"},
        )

        also_view = fo.DatasetView._build(dataset, view._serialize())

        self.assertEqual(len(also_view), 4)
        self.assertEqual(also_view.media_type, "group")

        dataset2 = dataset.clone()
        view2 = dataset2.group_by(E([F("sample_id"), F("device_id")]))

        self.assertEqual(len(view2), 4)
        self.assertSetEqual(
            set(dataset2.list_indexes()),
            default_indexes | {"_sample_id_1_device_id_1"},
        )

        also_view2 = fo.DatasetView._build(dataset2, view2._serialize())

        self.assertEqual(len(also_view2), 4)
        self.assertSetEqual(
            set(dataset2.list_indexes()),
            default_indexes | {"_sample_id_1_device_id_1"},
        )

    @drop_datasets
    def test_group_by_complex(self):
        dataset = _make_group_by_dataset()
        sample_id1, sample_id2 = dataset.limit(2).values("sample_id")

        view = (
            dataset.match(F("frame_number") <= 2)
            .group_by("sample_id", order_by="frame_number", reverse=True)
            .sort_by("filepath")
        )

        self.assertEqual(view.media_type, "group")
        self.assertTrue(view._is_dynamic_groups)
        self.assertEqual(len(view), 2)

        sample = view.first()
        group_id = sample.sample_id
        group = view.get_dynamic_group(group_id)
        also_group = next(view.iter_dynamic_groups())
        sample_ids = view.values("sample_id")
        frame_numbers = [s.frame_number for s in group]
        also_frame_numbers = [s.frame_number for s in also_group]

        self.assertEqual(sample.sample_id, sample_id1)
        self.assertEqual(sample.frame_number, 2)
        self.assertIsInstance(group, fo.DatasetView)
        self.assertIsInstance(also_group, fo.DatasetView)
        self.assertListEqual(sample_ids, [sample_id1, sample_id2])
        self.assertListEqual(frame_numbers, [2, 1])
        self.assertListEqual(also_frame_numbers, [2, 1])

        flat_view = view.flatten(fo.Limit(1))

        self.assertEqual(flat_view.media_type, "image")
        self.assertEqual(len(flat_view), 2)
        self.assertListEqual(
            flat_view.values("sample_id"),
            [sample_id1, sample_id2],
        )
        self.assertListEqual(flat_view.values("frame_number"), [2, 2])

    @drop_datasets
    def test_group_by_flat(self):
        dataset = _make_group_by_dataset()
        sample_id1, sample_id2 = dataset.limit(2).values("sample_id")

        view = dataset.group_by("sample_id", flat=True)

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 5)
        self.assertDictEqual(
            _rle(view.values("sample_id")),
            {sample_id1: 3, sample_id2: 2},
        )

        view = dataset.match(F("frame_number") <= 2).group_by(
            "sample_id", flat=True
        )

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 4)

    @drop_datasets
    def test_flatten(self):
        dataset = _make_group_by_dataset()
        sample_id1, sample_id2 = dataset.limit(2).values("sample_id")

        view = dataset.group_by("sample_id").sort_by("filepath").flatten()

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 5)
        self.assertListEqual(
            view.values("sample_id"),
            [sample_id1] * 3 + [sample_id2] * 2,
        )
        self.assertListEqual(
            view.values("frame_number"),
            [1, 3, 2, 2, 1],
        )

        view = (
            dataset.group_by("sample_id")
            .sort_by("filepath")
            .flatten(fo.Limit(1))
        )

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 2)
        self.assertListEqual(
            view.values("sample_id"),
            [sample_id1, sample_id2],
        )
        self.assertListEqual(view.values("frame_number"), [1, 2])

        view = (
            dataset.group_by("sample_id", order_by="frame_number")
            .sort_by("filepath")
            .flatten()
        )

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 5)
        self.assertListEqual(
            view.values("sample_id"),
            [sample_id1] * 3 + [sample_id2] * 2,
        )
        self.assertListEqual(
            view.values("frame_number"),
            [1, 2, 3, 1, 2],
        )

        view = (
            dataset.group_by("sample_id", order_by="frame_number")
            .sort_by("filepath")
            .flatten(fo.Limit(1))
        )

        self.assertEqual(view.media_type, "image")
        self.assertEqual(len(view), 2)
        self.assertListEqual(
            view.values("sample_id"),
            [sample_id1, sample_id2],
        )
        self.assertListEqual(view.values("frame_number"), [1, 1])

    @drop_datasets
    def test_match_expr(self):
        dataset = _make_group_by_dataset()

        view = dataset.group_by(
            "frame_number", flat=True, match_expr=(F().length() > 1)
        )
        self.assertDictEqual(view.count_values("frame_number"), {1: 2, 2: 2})

    @drop_datasets
    def test_group_by_group_dataset(self):
        dataset = _make_group_by_group_dataset()

        view = dataset.group_by("scene")

        self.assertEqual(view.media_type, "group")
        self.assertEqual(view.group_field, "group_field")
        self.assertEqual(
            view.group_media_types, {"left": "image", "right": "image"}
        )
        self.assertEqual(view.group_slice, "left")
        self.assertEqual(len(view), 2)

        sample = view.first()
        self.assertEqual(sample.group_field.name, "left")

        view.group_slice = "right"

        self.assertEqual(view.group_slice, "right")

        sample = view.first()
        self.assertEqual(sample.group_field.name, "right")

        view2 = view.get_dynamic_group("bar")

        self.assertEqual(view2.media_type, "group")
        self.assertEqual(view2.group_field, "group_field")
        self.assertEqual(
            view2.group_media_types, {"left": "image", "right": "image"}
        )
        self.assertEqual(view2.group_slice, "right")
        self.assertEqual(len(view2), 1)

        sample2 = view2.first()

        self.assertEqual(sample2.scene, "bar")
        self.assertEqual(sample2.group_field.name, "right")

        group = view2.get_group(sample2.group_field.id)

        self.assertIsInstance(group, dict)
        self.assertEqual(len(group), 2)
        for sample in group.values():
            self.assertEqual(sample.scene, "bar")

    @drop_datasets
    def test_group_by_patches(self):
        samples = [
            fo.Sample(
                filepath="image1.jpg",
                detections=fo.Detections(
                    detections=[
                        fo.Detection(label="cat", bounding_box=[0, 0, 1, 1]),
                        fo.Detection(label="dog", bounding_box=[0, 0, 1, 1]),
                    ]
                ),
            ),
            fo.Sample(
                filepath="image2.jpg",
                detections=fo.Detections(
                    detections=[
                        fo.Detection(label="cow", bounding_box=[0, 0, 1, 1]),
                        fo.Detection(label="fox", bounding_box=[0, 0, 1, 1]),
                        fo.Detection(label="bird", bounding_box=[0, 0, 1, 1]),
                    ]
                ),
            ),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        sample2 = dataset.last()

        view = dataset.to_patches("detections").group_by("sample_id")

        self.assertEqual(view.media_type, "group")
        self.assertEqual(len(view), 2)
        self.assertTrue(view._is_dynamic_groups)
        self.assertIsNone(view.group_field)
        self.assertIsNone(view.group_media_types)
        self.assertIsNone(view.group_slice)
        self.assertIsNone(view.group_slices)

        group = view.get_dynamic_group(sample2.id)

        self.assertEqual(len(group), 3)
        self.assertEqual(group.first().sample_id, sample2.id)

        dataset.save_view("group_by_patches", view)

        self.assertEqual(view.name, "group_by_patches")
        self.assertTrue(view.is_saved)

        dataset.reload()
        also_view = dataset.load_saved_view("group_by_patches")

        self.assertEqual(also_view, view)
        self.assertEqual(also_view.media_type, "group")
        self.assertEqual(also_view.name, "group_by_patches")
        self.assertTrue(also_view.is_saved)
        self.assertEqual(len(also_view), 2)

    @drop_datasets
    def test_group_by_frames(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(filepath="frame11.jpg")
        sample1.frames[2] = fo.Frame(filepath="frame12.jpg")

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame(filepath="frame21.jpg")
        sample2.frames[2] = fo.Frame(filepath="frame22.jpg")
        sample2.frames[3] = fo.Frame(filepath="frame23.jpg")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        sample2 = dataset.last()

        view = dataset.to_frames().group_by("sample_id")

        self.assertEqual(view.media_type, "group")
        self.assertEqual(len(view), 2)
        self.assertTrue(view._is_dynamic_groups)
        self.assertIsNone(view.group_field)
        self.assertIsNone(view.group_media_types)
        self.assertIsNone(view.group_slice)
        self.assertIsNone(view.group_slices)

        group = view.get_dynamic_group(sample2.id)

        self.assertEqual(len(group), 3)
        self.assertEqual(group.first().sample_id, sample2.id)

        dataset.save_view("group_by_frames", view)

        self.assertEqual(view.name, "group_by_frames")
        self.assertTrue(view.is_saved)

        dataset.reload()
        also_view = dataset.load_saved_view("group_by_frames")

        self.assertEqual(also_view, view)
        self.assertEqual(also_view.media_type, "group")
        self.assertEqual(also_view.name, "group_by_frames")
        self.assertTrue(also_view.is_saved)
        self.assertEqual(len(also_view), 2)

    @drop_datasets
    def test_group_by_clips(self):
        samples = [
            fo.Sample(
                filepath="video1.mp4",
                detections=fo.TemporalDetections(
                    detections=[
                        fo.TemporalDetection(label="cat", support=[1, 4]),
                        fo.TemporalDetection(label="dog", support=[2, 5]),
                    ]
                ),
            ),
            fo.Sample(
                filepath="video2.mp4",
                detections=fo.TemporalDetections(
                    detections=[
                        fo.TemporalDetection(label="cow", support=[1, 4]),
                        fo.TemporalDetection(label="fox", support=[2, 5]),
                        fo.TemporalDetection(label="fox", support=[3, 6]),
                    ]
                ),
            ),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        sample2 = dataset.last()

        view = dataset.to_clips("detections").group_by("sample_id")

        self.assertEqual(view.media_type, "group")
        self.assertEqual(len(view), 2)
        self.assertTrue(view._is_dynamic_groups)
        self.assertIsNone(view.group_field)
        self.assertIsNone(view.group_media_types)
        self.assertIsNone(view.group_slice)
        self.assertIsNone(view.group_slices)

        group = view.get_dynamic_group(sample2.id)

        self.assertEqual(len(group), 3)
        self.assertEqual(group.first().sample_id, sample2.id)

        dataset.save_view("group_by_clips", view)
        self.assertTrue(view.is_saved)

        self.assertEqual(view.name, "group_by_clips")

        dataset.reload()
        also_view = dataset.load_saved_view("group_by_clips")

        self.assertEqual(also_view, view)
        self.assertEqual(also_view.media_type, "group")
        self.assertEqual(also_view.name, "group_by_clips")
        self.assertTrue(also_view.is_saved)
        self.assertEqual(len(also_view), 2)

    @drop_datasets
    def test_expand_group_metadata(self):
        dataset: fo.Dataset = fo.Dataset()

        group = fo.Group()
        samples = [
            fo.Sample(filepath="video.mp4", group=group.element("video")),
            fo.Sample(filepath="image.png", group=group.element("image")),
        ]
        dataset.add_samples(samples)

        # assert that slices have their media type metadata fields populated
        for (
            name,
            field,
        ) in fome.ImageMetadata._fields.items():  # pylint: disable=no-member
            if name.startswith("_"):
                continue

            self.assertIsInstance(
                dataset.get_field(f"metadata.{name}", include_private=True),
                field.__class__,
            )

        for (
            name,
            field,
        ) in fome.VideoMetadata._fields.items():  # pylint: disable=no-member
            if name.startswith("_"):
                continue

            self.assertIsInstance(
                dataset.get_field(f"metadata.{name}", include_private=True),
                field.__class__,
            )


def _make_group_by_dataset():
    sample_id1 = ObjectId()
    sample_id2 = ObjectId()

    samples = [
        fo.Sample(
            filepath="frame11.jpg",
            sample_id=sample_id1,
            frame_number=1,
        ),
        fo.Sample(
            filepath="frame22.jpg",
            sample_id=sample_id2,
            frame_number=2,
        ),
        fo.Sample(
            filepath="frame13.jpg",
            sample_id=sample_id1,
            frame_number=3,
        ),
        fo.Sample(
            filepath="frame21.jpg",
            sample_id=sample_id2,
            frame_number=1,
        ),
        fo.Sample(
            filepath="frame12.jpg",
            sample_id=sample_id1,
            frame_number=2,
        ),
    ]

    dataset = fo.Dataset()
    dataset.add_sample_field("sample_id", fo.ObjectIdField)
    dataset.add_samples(samples)

    return dataset


def _make_group_by_group_dataset():
    dataset = fo.Dataset()
    dataset.add_group_field("group_field", default="left")

    group1 = fo.Group()
    group2 = fo.Group()
    group3 = fo.Group()

    samples = [
        fo.Sample(
            filepath="left-image1.jpg",
            group_field=group1.element("left"),
            scene="foo",
        ),
        fo.Sample(
            filepath="right-image1.jpg",
            group_field=group1.element("right"),
            scene="foo",
        ),
        fo.Sample(
            filepath="left-image2.jpg",
            group_field=group2.element("left"),
            scene="foo",
        ),
        fo.Sample(
            filepath="right-image2.jpg",
            group_field=group2.element("right"),
            scene="foo",
        ),
        fo.Sample(
            filepath="left-image3.jpg",
            group_field=group3.element("left"),
            scene="bar",
        ),
        fo.Sample(
            filepath="right-image3.jpg",
            group_field=group3.element("right"),
            scene="bar",
        ),
    ]

    dataset.add_samples(samples)

    return dataset


def _rle(values):
    return dict((k, len(list(group))) for k, group in groupby(values))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
