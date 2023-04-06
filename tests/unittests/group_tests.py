"""
FiftyOne group-related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
import random
import string
import unittest

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.utils.data as foud
import fiftyone.utils.groups as foug
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

        self.assertEqual(len(dataset), 4)
        self.assertEqual(dataset.media_type, "group")
        self.assertEqual(dataset.group_slice, "ego")
        self.assertEqual(
            len(dataset.select_group_slices(_allow_mixed=True)), 12
        )
        self.assertEqual(dataset.count("frames"), 4)

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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
